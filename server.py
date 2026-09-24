import os
import sys
import time
import numpy as np
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
from qiskit.quantum_info import Statevector
from qiskit.circuit.library import HGate, XGate, ZGate, YGate, CXGate, SdgGate, SGate

app = Flask(__name__, template_folder="templates", static_folder="static")
app.config["SECRET_KEY"] = "quantum-sim-secret-key"

socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# Standardized Bell State <-> 2-Bit String Mapping:
# |Φ+⟩ <-> 00, |Φ-⟩ <-> 01, |Ψ+⟩ <-> 10, |Ψ-⟩ <-> 11
BELL_TO_BITS = {
    "|Φ+⟩": "00",
    "|Φ-⟩": "01",
    "|Ψ+⟩": "10",
    "|Ψ-⟩": "11",
}

BITS_TO_BELL = {
    "00": "|Φ+⟩",
    "01": "|Φ-⟩",
    "10": "|Ψ+⟩",
    "11": "|Ψ-⟩",
}

BITS_TO_BELL_KEY = {
    "00": "phi+",
    "01": "phi-",
    "10": "psi+",
    "11": "psi-",
}


def transform_state_label(current_label: str, gate: str) -> str:
    """
    Transforms the displayed state label when a single-qubit gate (X, Z, Y, H) is applied.
    Transitions:
      For basis states:
      X: |0⟩ -> |1⟩, |1⟩ -> |0⟩, |+⟩ -> |+⟩, |-⟩ -> |-⟩
      Z: |0⟩ -> |0⟩, |1⟩ -> |1⟩, |+⟩ -> |-⟩, |-⟩ -> |+⟩
      Y: |0⟩ -> |1⟩, |1⟩ -> |0⟩, |+⟩ -> |-⟩, |-⟩ -> |+⟩
      H: |0⟩ -> |+⟩, |1⟩ -> |-⟩, |+⟩ -> |0⟩, |-⟩ -> |1⟩
      For generic/unknown states:
      Prefixes gate to the left (e.g. Unknown Qubit |ψ⟩ -> H|ψ⟩ -> XH|ψ⟩ -> ZXH|ψ⟩).
    """
    gate = gate.upper().strip()
    basis_map = {
        "|0⟩": {"X": "|1⟩", "Z": "|0⟩", "Y": "|1⟩", "H": "|+⟩"},
        "|1⟩": {"X": "|0⟩", "Z": "|1⟩", "Y": "|0⟩", "H": "|-⟩"},
        "|+⟩": {"X": "|+⟩", "Z": "|-⟩", "Y": "|-⟩", "H": "|0⟩"},
        "|-⟩": {"X": "|-⟩", "Z": "|+⟩", "Y": "|+⟩", "H": "|1⟩"},
    }

    if current_label in basis_map and gate in basis_map[current_label]:
        return basis_map[current_label][gate]

    if current_label in ("Unknown Qubit |ψ⟩", "|ψ⟩", "Unknown Qubit"):
        return f"{gate}|ψ⟩"

    if current_label.endswith("|ψ⟩"):
        return f"{gate}{current_label}"

    # For EPR halves or generic states: attach gate as prefix
    return f"{gate}{current_label}"


def format_eigenstate_label(bitstr: str, basis: str) -> str:
    """
    Maps binary measurement outcome strings ('0', '1', '01'...) to their respective quantum eigenstate labels.
    - Z-Basis: 0 -> |0⟩, 1 -> |1⟩  (e.g. '01' -> |01⟩)
    - X-Basis: 0 -> |+⟩, 1 -> |-⟩  (e.g. '01' -> |+-⟩)
    - Y-Basis: 0 -> |+i⟩, 1 -> |-i⟩ (e.g. '0' -> |+i⟩, '01' -> |+i, -i⟩)
    """
    basis = basis.upper().strip()
    if basis == "Z":
        return f"|{bitstr}⟩"
    elif basis == "X":
        chars = "".join("+" if b == "0" else "-" for b in bitstr)
        return f"|{chars}⟩"
    elif basis == "Y":
        parts = ["+i" if b == "0" else "-i" for b in bitstr]
        if len(parts) == 1:
            return f"|{parts[0]}⟩"
        return f"|{', '.join(parts)}⟩"
    return f"|{bitstr}⟩"


# ==============================================================================
# Quantum Cluster Representation (Solves 32-bit Memory Explosion)
# ==============================================================================
class QuantumCluster:
    """
    Represents an isolated entangled quantum subsystem.
    Maintains an independent Statevector sized only to the qubits entangled within this cluster.
    """

    def __init__(self, cluster_id, qubit_ids, statevector):
        self.cluster_id = cluster_id
        self.qubit_ids = list(qubit_ids)  # Visual qubit IDs in relative index order [0 .. k-1]
        self.statevector = statevector    # qiskit.quantum_info.Statevector


# ==============================================================================
# Quantum Logic Engine (Cluster-Based Room Quantum Manager)
# ==============================================================================
class RoomQuantumManager:
    """
    Manages quantum clusters, qubit inventory, batch operations,
    time-ordered nested classical records, and state tomography.
    """

    def __init__(self, room_name):
        self.room_name = room_name
        self.clusters = {}                 # cluster_id -> QuantumCluster
        self.cluster_counter = 0
        self.qubit_to_cluster = {}         # qid -> cluster_id
        self.qubits = {}                   # qid -> qubit metadata dict
        self.qubit_counter = -1            # 0-indexed: first qubit prepared will be #0!
        self.classical_records = []        # Unified, time-ordered, nested classical records
        self.joint_measurements = []       # Legacy compatibility
        self.batch_bitstring_records = []  # Legacy compatibility

    def _merge_clusters(self, cluster_ids):
        """
        Merges multiple clusters into a single unified cluster via tensor product (expand).
        Used when an entangling gate (e.g. CNOT) or Bell measurement connects qubits from different clusters.
        """
        unique_cids = []
        for cid in cluster_ids:
            if cid in self.clusters and cid not in unique_cids:
                unique_cids.append(cid)

        if not unique_cids:
            return None
        if len(unique_cids) == 1:
            return self.clusters[unique_cids[0]]

        main_cluster = self.clusters[unique_cids[0]]
        for other_cid in unique_cids[1:]:
            other_cluster = self.clusters[other_cid]
            merged_qubit_ids = list(main_cluster.qubit_ids) + list(other_cluster.qubit_ids)
            merged_sv = main_cluster.statevector.expand(other_cluster.statevector)

            main_cluster.qubit_ids = merged_qubit_ids
            main_cluster.statevector = merged_sv

            for qid in other_cluster.qubit_ids:
                self.qubit_to_cluster[qid] = main_cluster.cluster_id

            del self.clusters[other_cid]

        return main_cluster

    def _slice_out_qubit(self, cluster, measured_idx, outcome_val):
        """
        Removes a collapsed qubit from a cluster's statevector via projective subspace slicing.
        Since the qubit collapsed into pure eigenstate |0> or |1>,
        it is completely unentangled from remaining qubits in the cluster.
        """
        num_qubits = cluster.statevector.num_qubits
        if num_qubits <= 1:
            cluster.statevector = None
            cluster.qubit_ids = []
            return

        shape = (2,) * num_qubits
        arr = cluster.statevector.data.reshape(shape)
        # In Qiskit, index k maps to axis (num_qubits - 1 - k)
        axis = num_qubits - 1 - measured_idx
        slc = [slice(None)] * num_qubits
        slc[axis] = outcome_val
        sliced = arr[tuple(slc)]
        norm = np.linalg.norm(sliced)
        if norm > 0:
            sliced = sliced / norm
        cluster.statevector = Statevector(sliced.flatten())
        cluster.qubit_ids.pop(measured_idx)

    def prepare_single_qubit(self, owner_sid, owner_name, state_label, count=1):
        """Prepares one or multiple single qubits in a basis state (|0>, |1>, |+>, |->)."""
        state_label = state_label.strip()
        count = max(1, min(100, int(count)))
        created = []

        for _ in range(count):
            if state_label == "0":
                new_sv = Statevector.from_label("0")
                disp = "|0⟩"
            elif state_label == "1":
                new_sv = Statevector.from_label("1")
                disp = "|1⟩"
            elif state_label == "+":
                new_sv = Statevector.from_label("0").evolve(HGate(), [0])
                disp = "|+⟩"
            elif state_label == "-":
                new_sv = Statevector.from_label("1").evolve(HGate(), [0])
                disp = "|-⟩"
            else:
                raise ValueError(f"Unknown single-qubit state: {state_label}")

            self.qubit_counter += 1
            qid = f"q{self.qubit_counter}"

            self.cluster_counter += 1
            cid = f"c_{self.cluster_counter}"
            cluster = QuantumCluster(cid, [qid], new_sv)
            self.clusters[cid] = cluster
            self.qubit_to_cluster[qid] = cid

            meta = {
                "id": qid,
                "number": self.qubit_counter,
                "cluster_id": cid,
                "owner_sid": owner_sid,
                "creator_sid": owner_sid,
                "creator_name": owner_name,
                "prep_label": disp,
                "display_label": disp,
                "is_measured": False,
                "transferred": False,
                "pair_id": None,
                "pair_type": None,
                "paired_with": None,
                "created_at": time.time(),
            }
            self.qubits[qid] = meta
            created.append(meta)

        return created

    def prepare_generic_state(self, owner_sid, owner_name, theta_deg, phi_deg, count=1):
        """
        Prepares generic superposition states with arbitrary relative phase:
        |ψ⟩ = cos(θ/2)|0⟩ + e^(iφ)sin(θ/2)|1⟩
        θ ∈ [0°, 180°], φ ∈ [0°, 360°].
        Computes and records theoretical probabilities in Z, X, and Y bases for tomography comparison.
        """
        try:
            theta_deg = float(theta_deg)
            phi_deg = float(phi_deg)
        except Exception:
            raise ValueError("Theta and Phi must be valid numbers.")

        count = max(1, min(100, int(count)))
        theta_rad = np.deg2rad(theta_deg)
        phi_rad = np.deg2rad(phi_deg)

        alpha = np.cos(theta_rad / 2.0)
        beta_complex = np.sin(theta_rad / 2.0) * np.exp(1j * phi_rad)

        # Theoretical probabilities for state tomography:
        pz0 = float(alpha**2)
        px0 = float(0.5 * (1.0 + np.sin(theta_rad) * np.cos(phi_rad)))
        py0 = float(0.5 * (1.0 + np.sin(theta_rad) * np.sin(phi_rad)))

        disp = f"|ψ(θ={theta_deg:.1f}°, φ={phi_deg:.1f}°)⟩"
        created = []

        for _ in range(count):
            self.qubit_counter += 1
            qid = f"q{self.qubit_counter}"
            new_sv = Statevector([complex(alpha, 0.0), complex(beta_complex.real, beta_complex.imag)])

            self.cluster_counter += 1
            cid = f"c_{self.cluster_counter}"
            cluster = QuantumCluster(cid, [qid], new_sv)
            self.clusters[cid] = cluster
            self.qubit_to_cluster[qid] = cid

            meta = {
                "id": qid,
                "number": self.qubit_counter,
                "cluster_id": cid,
                "owner_sid": owner_sid,
                "creator_sid": owner_sid,
                "creator_name": owner_name,
                "prep_label": disp,
                "display_label": disp,
                "is_generic": True,
                "theta": theta_deg,
                "phi": phi_deg,
                "alpha": float(alpha),
                "beta_real": float(beta_complex.real),
                "beta_imag": float(beta_complex.imag),
                "theo_pz0": pz0,
                "theo_px0": px0,
                "theo_py0": py0,
                "is_measured": False,
                "transferred": False,
                "pair_id": None,
                "pair_type": None,
                "paired_with": None,
                "created_at": time.time(),
            }
            self.qubits[qid] = meta
            created.append(meta)

        return created, pz0, px0, py0

    def prepare_bell_pair(self, owner_sid, owner_name, bell_type, count=1):
        """
        Prepares one or multiple entangled Bell pairs (|Φ+>, |Φ->, |Ψ+>, |Ψ->).
        Mapping:
        |Φ+⟩ <-> 00
        |Φ-⟩ <-> 01
        |Ψ+⟩ <-> 10
        |Ψ-⟩ <-> 11
        Both qubits share pair_id so they can be grouped visually in the inventory.
        """
        bell_type = bell_type.lower().strip()
        count = max(1, min(100, int(count)))
        created = []

        for _ in range(count):
            base = Statevector.from_label("00").evolve(HGate(), [0]).evolve(CXGate(), [0, 1])

            if bell_type in ("phi+", "phi_plus", "00"):
                bell_sv = base
                disp = "|Φ+⟩"
            elif bell_type in ("phi-", "phi_minus", "01"):
                bell_sv = base.evolve(ZGate(), [0])
                disp = "|Φ-⟩"
            elif bell_type in ("psi+", "psi_plus", "10"):
                bell_sv = base.evolve(XGate(), [1])
                disp = "|Ψ+⟩"
            elif bell_type in ("psi-", "psi_minus", "11"):
                bell_sv = base.evolve(ZGate(), [0]).evolve(XGate(), [1])
                disp = "|Ψ-⟩"
            else:
                raise ValueError(f"Unknown Bell state type: {bell_type}")

            self.qubit_counter += 1
            qid1 = f"q{self.qubit_counter}"
            num1 = self.qubit_counter

            self.qubit_counter += 1
            qid2 = f"q{self.qubit_counter}"
            num2 = self.qubit_counter

            pair_id = f"pair_{num1}_{num2}"

            self.cluster_counter += 1
            cid = f"c_{self.cluster_counter}"
            cluster = QuantumCluster(cid, [qid1, qid2], bell_sv)
            self.clusters[cid] = cluster
            self.qubit_to_cluster[qid1] = cid
            self.qubit_to_cluster[qid2] = cid

            meta1 = {
                "id": qid1,
                "number": num1,
                "cluster_id": cid,
                "owner_sid": owner_sid,
                "creator_sid": owner_sid,
                "creator_name": owner_name,
                "prep_label": f"{disp} (Part A)",
                "display_label": f"{disp} (Part A)",
                "pair_id": pair_id,
                "pair_type": disp,
                "paired_with": qid2,
                "is_measured": False,
                "transferred": False,
                "measured_basis": None,
                "measured_value": None,
                "created_at": time.time(),
            }
            meta2 = {
                "id": qid2,
                "number": num2,
                "cluster_id": cid,
                "owner_sid": owner_sid,
                "creator_sid": owner_sid,
                "creator_name": owner_name,
                "prep_label": f"{disp} (Part B)",
                "display_label": f"{disp} (Part B)",
                "pair_id": pair_id,
                "pair_type": disp,
                "paired_with": qid1,
                "is_measured": False,
                "transferred": False,
                "measured_basis": None,
                "measured_value": None,
                "created_at": time.time(),
            }

            self.qubits[qid1] = meta1
            self.qubits[qid2] = meta2
            created.extend([meta1, meta2])

        return created

    def prepare_ghz_state(self, owner_sid, owner_name, n):
        """
        Prepares an n-qubit Greenberger-Horne-Zeilinger (GHZ) state:
        |GHZ_N⟩ = (|0...0⟩ + |1...1⟩) / √2
        """
        try:
            n = int(n)
        except Exception:
            raise ValueError("Number of qubits N must be an integer.")
        if n < 3 or n > 16:
            raise ValueError("GHZ state requires 3 ≤ N ≤ 16 qubits.")

        sv = Statevector.from_label("0" * n).evolve(HGate(), [0])
        for k in range(1, n):
            sv = sv.evolve(CXGate(), [0, k])

        self.cluster_counter += 1
        cid = f"c_{self.cluster_counter}"
        qids = []
        created = []

        start_num = self.qubit_counter + 1
        for k in range(n):
            self.qubit_counter += 1
            qid = f"q{self.qubit_counter}"
            qids.append(qid)
            disp = f"|GHZ_{n}⟩ (Part {k})"
            meta = {
                "id": qid,
                "number": self.qubit_counter,
                "cluster_id": cid,
                "owner_sid": owner_sid,
                "creator_sid": owner_sid,
                "creator_name": owner_name,
                "prep_label": disp,
                "display_label": disp,
                "is_measured": False,
                "transferred": False,
                "pair_id": f"ghz_{start_num}_{start_num + n - 1}",
                "pair_type": f"|GHZ_{n}⟩",
                "paired_with": None,
                "created_at": time.time(),
            }
            self.qubits[qid] = meta
            self.qubit_to_cluster[qid] = cid
            created.append(meta)

        cluster = QuantumCluster(cid, qids, sv)
        self.clusters[cid] = cluster
        return created

    def batch_encode_qubits(self, owner_sid, owner_name, bits_str, bases_str):
        """Encodes bits + bases into individual qubits without memory explosion."""
        bits = [c for c in bits_str if c in ("0", "1")]
        bases = [c.upper() for c in bases_str if c.upper() in ("Z", "X")]

        if not bits:
            raise ValueError("Bit sequence cannot be empty (must contain '0' or '1').")
        if len(bits) != len(bases):
            raise ValueError(f"Bit sequence length ({len(bits)}) does not match basis sequence length ({len(bases)}).")

        created = []
        for bit, basis in zip(bits, bases):
            state_lbl = bit if basis == "Z" else ("+" if bit == "0" else "-")
            metas = self.prepare_single_qubit(owner_sid, owner_name, state_lbl, count=1)
            created.append(metas[0])

        return created

    def batch_encode_epr(self, owner_sid, owner_name, bitstring):
        """
        Automated qubit encoding into EPR states (following superdense coding).
        Encodes bit pairs into Bell states:
        00 -> |Φ+⟩, 01 -> |Φ-⟩, 10 -> |Ψ+⟩, 11 -> |Ψ-⟩.
        """
        bits = [c for c in bitstring if c in ("0", "1")]
        if not bits:
            raise ValueError("Bit sequence cannot be empty.")
        if len(bits) % 2 != 0:
            raise ValueError(f"Bit sequence length ({len(bits)}) must be even for EPR pair encoding (pairs of 2 bits).")

        created = []
        pairs_summary = []

        for i in range(0, len(bits), 2):
            pair_bits = bits[i] + bits[i + 1]
            bell_key = BITS_TO_BELL_KEY[pair_bits]
            bell_name = BITS_TO_BELL[pair_bits]
            pair_metas = self.prepare_bell_pair(owner_sid, owner_name, bell_key, count=1)
            created.extend(pair_metas)
            pairs_summary.append({
                "bits": pair_bits,
                "bell_state": bell_name,
                "qubit_a": pair_metas[0]["number"],
                "qubit_b": pair_metas[1]["number"],
            })

        return created, pairs_summary

    def apply_single_gate(self, qid, gate_name, caller_sid):
        """Applies a 1-qubit gate (X, Z, Y, H) to an active qubit and updates its state label."""
        meta = self.qubits.get(qid)
        if not meta:
            raise ValueError(f"Qubit {qid} not found.")
        if meta["owner_sid"] != caller_sid:
            raise PermissionError("You can only manipulate qubits in your inventory.")
        if meta["is_measured"]:
            raise ValueError(f"Qubit #{meta['number']} has already been measured.")

        cid = self.qubit_to_cluster.get(qid)
        cluster = self.clusters.get(cid)
        if not cluster or cluster.statevector is None:
            raise ValueError(f"Active quantum cluster not found for qubit {qid}.")

        idx = cluster.qubit_ids.index(qid)
        gate_name = gate_name.upper().strip()
        if gate_name == "X":
            gate = XGate()
        elif gate_name == "Z":
            gate = ZGate()
        elif gate_name == "Y":
            gate = YGate()
        elif gate_name == "H":
            gate = HGate()
        elif gate_name == "I":
            return meta
        else:
            raise ValueError(f"Gate {gate_name} not supported. Use X, Z, Y, H, or I.")

        cluster.statevector = cluster.statevector.evolve(gate, [idx])

        # Update visual display label
        current_lbl = meta.get("display_label") or meta.get("prep_label")
        new_lbl = transform_state_label(current_lbl, gate_name)
        meta["display_label"] = new_lbl
        meta["prep_label"] = new_lbl

        return meta

    def apply_batch_gate(self, qubit_ids, gate_name, caller_sid):
        """Applies a 1-qubit gate (X, Z, Y, H) to multiple selected qubits."""
        if not qubit_ids:
            raise ValueError("No qubits selected for gate application.")
        metas = []
        for qid in qubit_ids:
            meta = self.apply_single_gate(qid, gate_name, caller_sid)
            metas.append(meta)
        return metas

    def apply_cnot_multi(self, control_qid, target_qids, caller_sid):
        """
        Applies CNOT where the 1st selected qubit is Control and remaining are Targets.
        Merges clusters when necessary, enabling creating n-qubit GHZ states across arbitrary qubits!
        """
        if not target_qids:
            raise ValueError("At least one target qubit is required for CNOT.")
        c_meta = self.qubits.get(control_qid)
        if not c_meta:
            raise ValueError(f"Control qubit {control_qid} not found.")
        if c_meta["owner_sid"] != caller_sid or c_meta["is_measured"]:
            raise ValueError("Invalid control qubit.")

        t_metas = []
        for t_qid in target_qids:
            if t_qid == control_qid:
                continue
            t_meta = self.qubits.get(t_qid)
            if not t_meta or t_meta["owner_sid"] != caller_sid or t_meta["is_measured"]:
                raise ValueError(f"Invalid target qubit {t_qid}.")

            # Ensure both qubits reside in the same cluster by merging if needed
            c_cid = self.qubit_to_cluster[control_qid]
            t_cid = self.qubit_to_cluster[t_qid]
            if c_cid != t_cid:
                cluster = self._merge_clusters([c_cid, t_cid])
            else:
                cluster = self.clusters[c_cid]

            c_idx = cluster.qubit_ids.index(control_qid)
            t_idx = cluster.qubit_ids.index(t_qid)
            cluster.statevector = cluster.statevector.evolve(CXGate(), [c_idx, t_idx])
            t_metas.append(t_meta)

        return c_meta, t_metas

    def apply_pauli_string(self, qubit_ids, pauli_string, caller_sid):
        """Applies a Pauli string (X, Z, Y, H, I) to the selected qubits in order."""
        clean_ops = [c.upper() for c in pauli_string if c.upper() in ("X", "Z", "Y", "H", "I")]
        if not clean_ops:
            raise ValueError("Pauli string must contain at least one valid gate (X, Z, Y, H, I).")
        if len(clean_ops) != len(qubit_ids):
            raise ValueError(f"Pauli string length ({len(clean_ops)}) must match the number of selected qubits ({len(qubit_ids)}).")

        metas = []
        for qid, op in zip(qubit_ids, clean_ops):
            meta = self.apply_single_gate(qid, op, caller_sid)
            metas.append((meta, op))
        return metas

    def transfer_batch_qubits(self, qubit_ids, from_sid, to_sid):
        """Transfers multiple qubits across the quantum channel in a single batch."""
        if not qubit_ids:
            raise ValueError("No qubits selected for transmission.")
        transferred = []
        for qid in qubit_ids:
            meta = self.qubits.get(qid)
            if not meta or meta["owner_sid"] != from_sid:
                raise PermissionError("You can only transfer qubits in your inventory.")
            if meta["is_measured"]:
                raise ValueError("Cannot transfer a measured qubit.")
            meta["owner_sid"] = to_sid
            meta["transferred"] = True
            # Recipient perceives an unknown quantum state |ψ⟩
            meta["display_label"] = "Unknown Qubit |ψ⟩"
            transferred.append(meta)
        return transferred

    def sample_qubits_joint(self, qubit_ids, caller_sid, basis="Z", shots=1000):
        """
        Executes multi-qubit joint sampling across N selected qubits in Z, X, or Y basis.
        Returns bitstrings strictly as '0' and '1' where 0 = positive eigenvector and 1 = negative eigenvector.
        """
        if not qubit_ids:
            raise ValueError("No qubits selected for sampling.")
        for qid in qubit_ids:
            meta = self.qubits.get(qid)
            if not meta or meta["owner_sid"] != caller_sid:
                raise PermissionError("You can only sample qubits in your inventory.")
            if meta["is_measured"]:
                raise ValueError(f"Qubit #{meta['number']} is already measured.")

        shots = max(10, min(10000, int(shots)))
        basis = basis.upper().strip()
        if basis not in ("Z", "X", "Y"):
            raise ValueError(f"Invalid sampling basis: {basis}. Use Z, X, or Y.")

        # Identify all distinct clusters involved
        distinct_cids = []
        for q in qubit_ids:
            cid = self.qubit_to_cluster[q]
            if cid not in distinct_cids:
                distinct_cids.append(cid)

        # For each cluster, sample selected qubits belonging to that cluster
        cluster_draws = {}
        for cid in distinct_cids:
            cluster = self.clusters[cid]
            cl_selected_qids = [q for q in qubit_ids if self.qubit_to_cluster[q] == cid]
            cl_internal_indices = [cluster.qubit_ids.index(q) for q in cl_selected_qids]

            cl_sv = cluster.statevector
            if basis == "X":
                for idx in cl_internal_indices:
                    cl_sv = cl_sv.evolve(HGate(), [idx])
            elif basis == "Y":
                for idx in cl_internal_indices:
                    cl_sv = cl_sv.evolve(SdgGate(), [idx]).evolve(HGate(), [idx])

            # Reversed indices ensure character 0 corresponds to first qubit in cl_selected_qids
            probs_dict = cl_sv.probabilities_dict(list(reversed(cl_internal_indices)))
            keys = list(probs_dict.keys())
            prob_values = np.array([probs_dict[k] for k in keys], dtype=float)
            prob_values = prob_values / np.sum(prob_values)

            draws = np.random.choice(keys, size=shots, p=prob_values)
            cluster_draws[cid] = {
                qid: [draw[i] for draw in draws]
                for i, qid in enumerate(cl_selected_qids)
            }

        # Combine outcomes across all selected qubits: outcomes are strictly binary '0' and '1'
        histogram = {}
        for s in range(shots):
            shot_bits = "".join(cluster_draws[self.qubit_to_cluster[q]][q][s] for q in qubit_ids)
            histogram[shot_bits] = histogram.get(shot_bits, 0) + 1

        frequencies = {k: float(c / shots) for k, c in histogram.items()}

        legend = "0 ↔ |0⟩, 1 ↔ |1⟩" if basis == "Z" else ("0 ↔ |+⟩, 1 ↔ |-⟩" if basis == "X" else "0 ↔ |+i⟩, 1 ↔ |-i⟩")

        eigenstate_histogram = {
            format_eigenstate_label(k, basis): count
            for k, count in histogram.items()
        }
        eigenstate_frequencies = {
            format_eigenstate_label(k, basis): freq
            for k, freq in frequencies.items()
        }

        return {
            "qubit_ids": qubit_ids,
            "qubit_numbers": [self.qubits[q]["number"] for q in qubit_ids],
            "basis": basis,
            "eigenstates_legend": legend,
            "shots": shots,
            "histogram": histogram,
            "frequencies": frequencies,
            "eigenstate_histogram": eigenstate_histogram,
            "eigenstate_frequencies": eigenstate_frequencies,
            "num_qubits": len(qubit_ids),
        }

    def measure_qubit(self, qid, basis, caller_sid):
        """
        Measures a single qubit in Z, X, or Y basis.
        Outcome is strictly '0' or '1' processed as classical bits, recording the collapsed eigenvector.
        """
        meta = self.qubits.get(qid)
        if not meta:
            raise ValueError(f"Qubit {qid} not found.")
        if meta["owner_sid"] != caller_sid:
            raise PermissionError("You do not own this qubit.")
        if meta["is_measured"]:
            raise ValueError("Qubit has already been measured.")

        cid = self.qubit_to_cluster[qid]
        cluster = self.clusters[cid]
        idx = cluster.qubit_ids.index(qid)
        basis = basis.upper().strip()

        if basis == "Z":
            outcome, collapsed_sv = cluster.statevector.measure([idx])
            val = int(outcome)
            disp_result = "0" if val == 0 else "1"
            eigenstate = "|0⟩" if val == 0 else "|1⟩"
            basis_name = "Computational (Z)"
            cluster.statevector = collapsed_sv
            self._slice_out_qubit(cluster, idx, val)

        elif basis == "X":
            temp_sv = cluster.statevector.evolve(HGate(), [idx])
            outcome, collapsed_sv = temp_sv.measure([idx])
            val = int(outcome)
            disp_result = "0" if val == 0 else "1"
            eigenstate = "|+⟩" if val == 0 else "|-⟩"
            basis_name = "Diagonal (X)"
            cluster.statevector = collapsed_sv
            self._slice_out_qubit(cluster, idx, val)

        elif basis == "Y":
            temp_sv = cluster.statevector.evolve(SdgGate(), [idx]).evolve(HGate(), [idx])
            outcome, collapsed_sv = temp_sv.measure([idx])
            val = int(outcome)
            disp_result = "0" if val == 0 else "1"
            eigenstate = "|+i⟩" if val == 0 else "|-i⟩"
            basis_name = "Circular (Y)"
            cluster.statevector = collapsed_sv
            self._slice_out_qubit(cluster, idx, val)
        else:
            raise ValueError(f"Unknown measurement basis: {basis}. Use Z, X, or Y.")

        if len(cluster.qubit_ids) == 0:
            del self.clusters[cid]

        meta["is_measured"] = True
        meta["measured_basis"] = basis_name
        meta["measured_value"] = disp_result
        meta["eigenstate"] = eigenstate

        return meta, disp_result, basis_name, eigenstate

    def measure_batch_qubits(self, qubit_ids, bases_input, caller_sid):
        """
        Measures selected qubits against bases (Z, X, Y).
        If 1 qubit: stores single_bit record (NO Batch Bitstring rectangle).
        If > 1 qubit: stores batch_bits record with individual outcomes NESTED inside.
        """
        if not qubit_ids:
            raise ValueError("No qubits selected for measurement.")

        clean_bases = [c.upper() for c in bases_input if c.upper() in ("Z", "X", "Y")]
        if len(clean_bases) == 1:
            bases_list = clean_bases * len(qubit_ids)
        elif len(clean_bases) == len(qubit_ids):
            bases_list = clean_bases
        else:
            raise ValueError(f"Bases count ({len(clean_bases)}) must equal 1 or the qubit count ({len(qubit_ids)}).")

        ordered_outcomes = []
        for qid, basis in zip(qubit_ids, bases_list):
            meta, disp_result, basis_name, eigenstate = self.measure_qubit(qid, basis, caller_sid)
            ordered_outcomes.append({
                "id": qid,
                "number": meta["number"],
                "basis": basis,
                "basis_name": basis_name,
                "eigenstate": eigenstate,
                "outcome": disp_result,
            })

        bitstring = "".join(o["outcome"] for o in ordered_outcomes)
        bases_str = "".join(bases_list)
        qubit_nums = [self.qubits[q]["number"] for q in qubit_ids]

        if len(qubit_ids) == 1:
            # Single qubit measured: No batch card!
            o = ordered_outcomes[0]
            single_rec = {
                "id": f"single_{o['id']}_{int(time.time() * 1000)}",
                "type": "single_bit",
                "qubit_id": o["id"],
                "qubit_number": o["number"],
                "basis": o["basis_name"],
                "basis_key": o["basis"],
                "eigenstate": o["eigenstate"],
                "value": o["outcome"],
                "timestamp": time.strftime("%H:%M:%S"),
                "owner_sid": caller_sid,
            }
            self.classical_records.append(single_rec)
            return ordered_outcomes, bitstring, single_rec
        else:
            # Multiple qubits measured: Nest individual bits inside batch record!
            batch_rec = {
                "id": f"batch_{int(time.time() * 1000)}",
                "type": "batch_bits",
                "is_batch_string": True,
                "qubit_numbers": qubit_nums,
                "bitstring": bitstring,
                "bases": bases_str,
                "timestamp": time.strftime("%H:%M:%S"),
                "owner_sid": caller_sid,
                "nested_bits": [
                    {
                        "qubit_id": o["id"],
                        "qubit_number": o["number"],
                        "basis": o["basis_name"],
                        "basis_key": o["basis"],
                        "eigenstate": o["eigenstate"],
                        "value": o["outcome"],
                    }
                    for o in ordered_outcomes
                ]
            }
            self.classical_records.append(batch_rec)
            self.batch_bitstring_records.append(batch_rec)
            return ordered_outcomes, bitstring, batch_rec

    def measure_bell(self, control_qid, target_qid, caller_sid, record_to_history=True):
        """
        Performs a two-qubit Bell Basis measurement:
        CNOT(control, target) -> H(control) -> Computational Measurement.
        Nests bit-to-bit measurement outcomes (mc, mt) inside the joint Bell outcome.
        """
        if control_qid == target_qid:
            raise ValueError("Control and Target must be distinct qubits.")

        c_meta = self.qubits.get(control_qid)
        t_meta = self.qubits.get(target_qid)
        if not c_meta or not t_meta:
            raise ValueError("One or both qubits not found.")
        if c_meta["owner_sid"] != caller_sid or t_meta["owner_sid"] != caller_sid:
            raise PermissionError("You must own both qubits to perform Bell measurement.")
        if c_meta["is_measured"] or t_meta["is_measured"]:
            raise ValueError("Cannot measure already collapsed qubits.")

        c_cid = self.qubit_to_cluster[control_qid]
        t_cid = self.qubit_to_cluster[target_qid]
        if c_cid != t_cid:
            cluster = self._merge_clusters([c_cid, t_cid])
        else:
            cluster = self.clusters[c_cid]

        c_idx = cluster.qubit_ids.index(control_qid)
        t_idx = cluster.qubit_ids.index(target_qid)

        b_sv = cluster.statevector.evolve(CXGate(), [c_idx, t_idx]).evolve(HGate(), [c_idx])
        out_c, post_c = b_sv.measure([c_idx])
        out_t, post_t = post_c.measure([t_idx])
        mc = int(out_c)
        mt = int(out_t)

        if mc == 0 and mt == 0:
            bell_name = "|Φ+⟩"
        elif mc == 1 and mt == 0:
            bell_name = "|Φ-⟩"
        elif mc == 0 and mt == 1:
            bell_name = "|Ψ+⟩"
        else:
            bell_name = "|Ψ-⟩"

        cluster.statevector = post_t

        first_idx, first_val = (c_idx, mc) if c_idx > t_idx else (t_idx, mt)
        second_idx, second_val = (t_idx, mt) if c_idx > t_idx else (c_idx, mc)

        self._slice_out_qubit(cluster, first_idx, first_val)
        self._slice_out_qubit(cluster, second_idx, second_val)

        if len(cluster.qubit_ids) == 0:
            del self.clusters[cluster.cluster_id]

        encoded_bits = BELL_TO_BITS.get(bell_name, "00")

        c_meta["is_measured"] = True
        c_meta["measured_basis"] = "Bell Basis"
        c_meta["measured_value"] = str(mc)

        t_meta["is_measured"] = True
        t_meta["measured_basis"] = "Bell Basis"
        t_meta["measured_value"] = str(mt)

        qubit_a_num = min(c_meta["number"], t_meta["number"])
        qubit_b_num = max(c_meta["number"], t_meta["number"])

        joint_record = {
            "id": f"bell_{c_meta['id']}_{t_meta['id']}_{int(time.time() * 1000)}",
            "type": "joint_bell",
            "is_joint_bell": True,
            "qubit_a": qubit_a_num,
            "qubit_b": qubit_b_num,
            "control_qubit": c_meta["number"],
            "target_qubit": t_meta["number"],
            "bell_state": bell_name,
            "encoded_bits": encoded_bits,
            "control_bit": str(mc),
            "target_bit": str(mt),
            "owner_sid": caller_sid,
            "timestamp": time.strftime("%H:%M:%S"),
            "nested_bits": [
                {
                    "qubit_number": c_meta["number"],
                    "role": "Control (mc)",
                    "value": str(mc),
                },
                {
                    "qubit_number": t_meta["number"],
                    "role": "Target (mt)",
                    "value": str(mt),
                },
            ]
        }

        if record_to_history:
            self.classical_records.append(joint_record)
            self.joint_measurements.append(joint_record)

        return bell_name, str(mc), str(mt), encoded_bits, joint_record

    def measure_batch_bell(self, pairs_of_qids, caller_sid):
        """
        Unified Bell measurement:
        - If 1 pair: stores single joint_bell record (NO Batch Bell rectangle).
        - If > 1 pair: stores batch_bell record with the joint Bell records NESTED inside.
        """
        if not pairs_of_qids:
            raise ValueError("No qubit pairs provided for batch Bell measurement.")

        if len(pairs_of_qids) == 1:
            # 1 pair: only single joint_bell record!
            c_qid, t_qid = pairs_of_qids[0]
            bell_name, mc, mt, encoded_bits, joint_rec = self.measure_bell(c_qid, t_qid, caller_sid, record_to_history=True)
            return [joint_rec], encoded_bits, joint_rec
        else:
            # Multiple pairs: Nest joint records inside batch_bell!
            joint_results = []
            for c_qid, t_qid in pairs_of_qids:
                bell_name, mc, mt, encoded_bits, joint_rec = self.measure_bell(c_qid, t_qid, caller_sid, record_to_history=False)
                joint_results.append(joint_rec)

            full_bitstring = " ".join(j["encoded_bits"] for j in joint_results)
            states_summary = " ".join(j["bell_state"] for j in joint_results)

            batch_rec = {
                "id": f"batch_bell_{int(time.time() * 1000)}",
                "type": "batch_bell",
                "is_batch_bell": True,
                "pairs_count": len(joint_results),
                "bitstring": full_bitstring,
                "bell_states": states_summary,
                "pairs": [f"#{j['qubit_a']}-#{j['qubit_b']}" for j in joint_results],
                "timestamp": time.strftime("%H:%M:%S"),
                "owner_sid": caller_sid,
                "nested_joints": joint_results, # nested joint records
            }
            self.classical_records.append(batch_rec)
            self.batch_bitstring_records.append(batch_rec)

            return joint_results, full_bitstring, batch_rec

    def get_user_inventory(self, user_sid):
        """Returns sanitized inventory: active qubits and time-ordered nested classical records."""
        active_qubits = []

        for qid, meta in sorted(self.qubits.items(), key=lambda x: x[1]["number"]):
            if meta["owner_sid"] == user_sid and not meta["is_measured"]:
                is_unknown = meta["transferred"] or (meta["creator_sid"] != user_sid)
                lbl = meta.get("display_label") or meta.get("prep_label")
                active_qubits.append({
                    "id": meta["id"],
                    "number": meta["number"],
                    "is_unknown": is_unknown,
                    "label": lbl if not is_unknown else (lbl if lbl.endswith("|ψ⟩") else "Unknown Qubit |ψ⟩"),
                    "creator": meta["creator_name"],
                    "pair_id": meta.get("pair_id"),
                    "pair_type": meta.get("pair_type"),
                    "paired_with": meta.get("paired_with"),
                })

        user_records = [r for r in reversed(self.classical_records) if r["owner_sid"] == user_sid]
        user_joints = [j for j in reversed(self.joint_measurements) if j["owner_sid"] == user_sid]
        user_batch_strings = [b for b in reversed(self.batch_bitstring_records) if b["owner_sid"] == user_sid]
        user_classical_bits = [
            {"id": m["id"], "number": m["number"], "basis": m.get("measured_basis"), "value": m.get("measured_value")}
            for m in sorted(self.qubits.values(), key=lambda x: x["number"], reverse=True)
            if m["owner_sid"] == user_sid and m["is_measured"]
        ]

        return active_qubits, user_records, user_classical_bits, user_joints, user_batch_strings

    def clear_measured_bits(self, user_sid):
        """Removes measured classical bits, joint Bell outcomes, and batch bitstring records."""
        to_delete = [
            qid for qid, meta in self.qubits.items()
            if meta["owner_sid"] == user_sid and meta["is_measured"]
        ]
        for qid in to_delete:
            del self.qubits[qid]

        self.classical_records = [r for r in self.classical_records if r["owner_sid"] != user_sid]
        self.joint_measurements = [j for j in self.joint_measurements if j["owner_sid"] != user_sid]
        self.batch_bitstring_records = [b for b in self.batch_bitstring_records if b["owner_sid"] != user_sid]

    def reset(self):
        """Wipes the quantum state and resets counters for the room."""
        self.clusters.clear()
        self.cluster_counter = 0
        self.qubit_to_cluster.clear()
        self.qubits.clear()
        self.qubit_counter = -1  # Reset to -1 so first qubit is #0!
        self.classical_records.clear()
        self.joint_measurements.clear()
        self.batch_bitstring_records.clear()


# ==============================================================================
# Global Room & Connection State
# ==============================================================================
rooms = {}
clients = {}


def get_or_create_room(room_name):
    if room_name not in rooms:
        rooms[room_name] = {
            "manager": RoomQuantumManager(room_name),
            "users": {},
            "chat_history": [],
            "quantum_logs": [],
        }
    return rooms[room_name]


def broadcast_room_state(room_name):
    if room_name not in rooms:
        return
    room_data = rooms[room_name]
    mgr = room_data["manager"]
    user_list = [{"sid": sid, "username": name} for sid, name in room_data["users"].items()]

    active_count = sum(1 for m in mgr.qubits.values() if not m["is_measured"])
    emit("room_status", {
        "room": room_name,
        "users": user_list,
        "active_qubits_count": active_count,
    }, room=room_name)

    for sid in room_data["users"]:
        active, records, classical, joints, batch_strings = mgr.get_user_inventory(sid)
        emit("inventory_update", {
            "active_qubits": active,
            "classical_records": records,
            "classical_bits": classical,
            "joint_bell_outcomes": joints,
            "batch_bitstrings": batch_strings,
        }, to=sid)


def log_quantum_event(room_name, event_type, message, to_sid=None):
    """
    Logs quantum operations.
    When to_sid is set, the event is strictly private to that operator.
    When to_sid is None, the event is a public room-level notification.
    """
    if room_name not in rooms:
        return
    event = {
        "type": event_type,
        "message": message,
        "timestamp": time.strftime("%H:%M:%S"),
    }
    if to_sid:
        emit("quantum_event", event, to=to_sid)
    else:
        rooms[room_name]["quantum_logs"].append(event)
        emit("quantum_event", event, room=room_name)


# ==============================================================================
# HTTP Routes
# ==============================================================================
@app.route("/")
def index():
    return render_template("index.html")


# ==============================================================================
# WebSocket Handlers
# ==============================================================================
@socketio.on("connect")
def on_connect():
    pass


@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    if sid in clients:
        client = clients[sid]
        room_name = client["room"]
        username = client["username"]
        if room_name in rooms:
            rooms[room_name]["users"].pop(sid, None)
            log_quantum_event(room_name, "system", f"Node '{username}' disconnected.")
            broadcast_room_state(room_name)
        del clients[sid]


@socketio.on("join_room")
def handle_join_room(data):
    username = data.get("username", "Anonymous").strip() or "Anonymous"
    room_name = data.get("room", "lab-1").strip() or "lab-1"
    sid = request.sid

    if sid in clients:
        old_room = clients[sid]["room"]
        leave_room(old_room)
        if old_room in rooms:
            rooms[old_room]["users"].pop(sid, None)
            broadcast_room_state(old_room)

    clients[sid] = {"username": username, "room": room_name}
    join_room(room_name)

    room_data = get_or_create_room(room_name)
    room_data["users"][sid] = username

    emit("chat_history", room_data["chat_history"])
    emit("quantum_logs_history", room_data["quantum_logs"])

    log_quantum_event(room_name, "system", f"Node '{username}' joined quantum channel room '{room_name}'.")
    broadcast_room_state(room_name)


@socketio.on("send_classical_message")
def handle_send_classical_message(data):
    sid = request.sid
    client = clients.get(sid)
    if not client:
        return
    room_name = client["room"]
    message = data.get("message", "").strip()
    if not message:
        return

    chat_entry = {
        "sender": client["username"],
        "message": message,
        "timestamp": time.strftime("%H:%M:%S"),
        "sid": sid,
    }
    rooms[room_name]["chat_history"].append(chat_entry)
    emit("classical_message", chat_entry, room=room_name)


@socketio.on("prepare_state")
def handle_prepare_state(data):
    """Prepares predefined single-qubit states or Bell states with quantity count."""
    sid = request.sid
    client = clients.get(sid)
    if not client:
        return
    room_name = client["room"]
    state_type = data.get("state_type")
    count = int(data.get("count", 1))
    mgr = rooms[room_name]["manager"]

    try:
        if state_type in ("0", "1", "+", "-"):
            metas = mgr.prepare_single_qubit(sid, client["username"], state_type, count=count)
            numbers = [f"#{m['number']}" for m in metas]
            log_quantum_event(
                room_name,
                "prepare",
                f"You prepared {count}x state {metas[0]['prep_label']} → Qubits: {', '.join(numbers)}",
                to_sid=sid
            )
        elif state_type in ("phi+", "phi-", "psi+", "psi-"):
            metas = mgr.prepare_bell_pair(sid, client["username"], state_type, count=count)
            numbers = [f"#{m['number']}" for m in metas]
            log_quantum_event(
                room_name,
                "prepare",
                f"You prepared {count}x Bell pair {metas[0]['prep_label']} → Allocated {len(metas)} Qubits ({', '.join(numbers)})",
                to_sid=sid
            )
        else:
            emit("action_error", {"message": f"Invalid state type: {state_type}"})
            return

        broadcast_room_state(room_name)
    except Exception as e:
        emit("action_error", {"message": str(e)})


@socketio.on("prepare_generic_state")
def handle_prepare_generic_state(data):
    """
    Prepares a generic quantum state with polar angle θ and relative phase φ:
    |ψ⟩ = cos(θ/2)|0⟩ + e^(iφ)sin(θ/2)|1⟩
    Logs theoretical tomography probabilities: P_Z(0), P_X(0), P_Y(0).
    """
    sid = request.sid
    client = clients.get(sid)
    if not client:
        return
    room_name = client["room"]
    theta = data.get("theta", 60.0)
    phi = data.get("phi", 0.0)
    count = int(data.get("count", 1))
    mgr = rooms[room_name]["manager"]

    try:
        metas, pz0, px0, py0 = mgr.prepare_generic_state(sid, client["username"], theta, phi, count=count)
        numbers = [f"#{m['number']}" for m in metas]
        log_quantum_event(
            room_name,
            "prepare",
            f"You prepared {count}x Generic State {metas[0]['prep_label']} [Theoretical: P_Z(0)={pz0*100:.1f}%, P_X(0)={px0*100:.1f}%, P_Y(0)={py0*100:.1f}%] → Qubits: {', '.join(numbers)}",
            to_sid=sid
        )
        broadcast_room_state(room_name)
    except Exception as e:
        emit("action_error", {"message": str(e)})


@socketio.on("prepare_ghz")
def handle_prepare_ghz(data):
    """Prepares an n-qubit GHZ state."""
    sid = request.sid
    client = clients.get(sid)
    if not client:
        return
    room_name = client["room"]
    n = data.get("n", 3)
    mgr = rooms[room_name]["manager"]

    try:
        metas = mgr.prepare_ghz_state(sid, client["username"], n)
        numbers = [f"#{m['number']}" for m in metas]
        log_quantum_event(
            room_name,
            "prepare",
            f"You prepared {len(metas)}-Qubit GHZ State (|GHZ_{len(metas)}⟩) → Qubits: {', '.join(numbers)}",
            to_sid=sid
        )
        broadcast_room_state(room_name)
    except Exception as e:
        emit("action_error", {"message": str(e)})


@socketio.on("sample_state")
def handle_sample_state(data):
    """Executes multi-qubit joint sampling across N selected qubits in Z, X, or Y basis."""
    sid = request.sid
    client = clients.get(sid)
    if not client:
        return
    room_name = client["room"]
    qubit_ids = data.get("qubit_ids", [])
    if not qubit_ids and data.get("qubit_id"):
        qubit_ids = [data.get("qubit_id")]
    basis = data.get("basis", "Z").upper()
    shots = data.get("shots", 1000)
    mgr = rooms[room_name]["manager"]

    try:
        sample_results = mgr.sample_qubits_joint(qubit_ids, sid, basis=basis, shots=shots)
        qnums = [f"#{n}" for n in sample_results["qubit_numbers"]]
        freq_str = ", ".join(f"{k}: {v*100:.1f}%" for k, v in sorted(sample_results["eigenstate_frequencies"].items()))
        log_quantum_event(
            room_name,
            "sample",
            f"📊 Sampled Qubit(s) {', '.join(qnums)} in {basis}-Basis ({shots} shots) ➔ [{freq_str}]",
            to_sid=sid
        )
        emit("sample_results", sample_results)
    except Exception as e:
        emit("action_error", {"message": str(e)})


@socketio.on("tomography_sample")
def handle_tomography_sample(data):
    """Runs complete 3-basis state tomography (Z, X, Y) on selected qubits."""
    sid = request.sid
    client = clients.get(sid)
    if not client:
        return
    room_name = client["room"]
    qubit_ids = data.get("qubit_ids", [])
    if not qubit_ids and data.get("qubit_id"):
        qubit_ids = [data.get("qubit_id")]
    shots = data.get("shots", 1000)
    mgr = rooms[room_name]["manager"]

    try:
        res_z = mgr.sample_qubits_joint(qubit_ids, sid, basis="Z", shots=shots)
        res_x = mgr.sample_qubits_joint(qubit_ids, sid, basis="X", shots=shots)
        res_y = mgr.sample_qubits_joint(qubit_ids, sid, basis="Y", shots=shots)

        qnums = [f"#{n}" for n in res_z["qubit_numbers"]]
        target_bit = "0" * len(qubit_ids)
        pz0 = res_z["frequencies"].get(target_bit, 0.0) * 100
        px0 = res_x["frequencies"].get(target_bit, 0.0) * 100
        py0 = res_y["frequencies"].get(target_bit, 0.0) * 100

        z_label = format_eigenstate_label(target_bit, "Z")
        x_label = format_eigenstate_label(target_bit, "X")
        y_label = format_eigenstate_label(target_bit, "Y")

        log_quantum_event(
            room_name,
            "sample",
            f"🌐 Complete Tomography on {', '.join(qnums)}: P({z_label})={pz0:.1f}%, P({x_label})={px0:.1f}%, P({y_label})={py0:.1f}%",
            to_sid=sid
        )

        emit("tomography_complete_results", {
            "qubit_ids": qubit_ids,
            "qubit_numbers": res_z["qubit_numbers"],
            "z": res_z,
            "x": res_x,
            "y": res_y,
            "pz0": pz0,
            "px0": px0,
            "py0": py0,
            "z_label": z_label,
            "x_label": x_label,
            "y_label": y_label,
        })
    except Exception as e:
        emit("action_error", {"message": str(e)})


@socketio.on("batch_encode")
def handle_batch_encode(data):
    """Automatizes batch qubit encoding: bit sequence + basis sequence -> allocated qubits."""
    sid = request.sid
    client = clients.get(sid)
    if not client:
        return
    room_name = client["room"]
    bits = data.get("bits", "")
    bases = data.get("bases", "")
    mgr = rooms[room_name]["manager"]

    try:
        created = mgr.batch_encode_qubits(sid, client["username"], bits, bases)
        numbers = [f"#{m['number']}" for m in created]
        log_quantum_event(
            room_name,
            "prepare",
            f"You batch-encoded {len(created)} qubits (Bits: '{bits}', Bases: '{bases}') → Qubits {', '.join(numbers)}",
            to_sid=sid
        )
        broadcast_room_state(room_name)
    except Exception as e:
        emit("action_error", {"message": str(e)})


@socketio.on("batch_encode_epr")
def handle_batch_encode_epr(data):
    """Automated qubit encoding into EPR states (following superdense coding)."""
    sid = request.sid
    client = clients.get(sid)
    if not client:
        return
    room_name = client["room"]
    bits = data.get("bits", "")
    mgr = rooms[room_name]["manager"]

    try:
        created, pairs_summary = mgr.batch_encode_epr(sid, client["username"], bits)
        summary_str = " | ".join(f"{p['bits']}➔{p['bell_state']} (#{p['qubit_a']},#{p['qubit_b']})" for p in pairs_summary)
        log_quantum_event(
            room_name,
            "prepare",
            f"You encoded EPR stream [{bits}] ({len(pairs_summary)} pairs) → {summary_str}",
            to_sid=sid
        )
        broadcast_room_state(room_name)
    except Exception as e:
        emit("action_error", {"message": str(e)})


@socketio.on("apply_gate")
def handle_apply_gate(data):
    """Applies a 1-qubit gate (X, Z, Y, H) to one or multiple qubits."""
    sid = request.sid
    client = clients.get(sid)
    if not client:
        return
    room_name = client["room"]
    qubit_ids = data.get("qubit_ids", [])
    if not qubit_ids and data.get("qubit_id"):
        qubit_ids = [data.get("qubit_id")]
    gate = data.get("gate", "").upper()
    mgr = rooms[room_name]["manager"]

    if not qubit_ids:
        emit("action_error", {"message": "No qubits specified for gate application."})
        return

    try:
        metas = mgr.apply_batch_gate(qubit_ids, gate, sid)
        numbers = [f"#{m['number']}" for m in metas]
        log_quantum_event(
            room_name,
            "gate",
            f"You applied Gate '{gate}' to Qubits: {', '.join(numbers)} (New state: {metas[0]['display_label']})",
            to_sid=sid
        )
        broadcast_room_state(room_name)
    except Exception as e:
        emit("action_error", {"message": str(e)})


@socketio.on("apply_cnot")
def handle_apply_cnot(data):
    """Applies CNOT gate with 1st selected qubit as Control and remaining as Targets."""
    sid = request.sid
    client = clients.get(sid)
    if not client:
        return
    room_name = client["room"]
    control_id = data.get("control_id")
    target_ids = data.get("target_ids", [])
    if not target_ids and data.get("target_id"):
        target_ids = [data.get("target_id")]
    mgr = rooms[room_name]["manager"]

    try:
        c_meta, t_metas = mgr.apply_cnot_multi(control_id, target_ids, sid)
        tgt_nums = [f"#{m['number']}" for m in t_metas]
        log_quantum_event(
            room_name,
            "gate",
            f"You applied CNOT (Control: Qubit #{c_meta['number']} → Targets: {', '.join(tgt_nums)})",
            to_sid=sid
        )
        broadcast_room_state(room_name)
    except Exception as e:
        emit("action_error", {"message": str(e)})


@socketio.on("apply_pauli_string")
def handle_apply_pauli_string(data):
    """Applies a Pauli string (X, Z, Y, H, I) to multiple selected qubits."""
    sid = request.sid
    client = clients.get(sid)
    if not client:
        return
    room_name = client["room"]
    qubit_ids = data.get("qubit_ids", [])
    pauli_string = data.get("pauli_string", "")
    mgr = rooms[room_name]["manager"]

    try:
        metas = mgr.apply_pauli_string(qubit_ids, pauli_string, sid)
        summary = ", ".join(f"{op} on #{m['number']}" for m, op in metas)
        log_quantum_event(
            room_name,
            "gate",
            f"You applied Pauli string '{pauli_string.upper()}' → [{summary}]",
            to_sid=sid
        )
        broadcast_room_state(room_name)
    except Exception as e:
        emit("action_error", {"message": str(e)})


@socketio.on("send_qubit")
def handle_send_qubit(data):
    """Transmits qubits through the quantum channel to another node."""
    sid = request.sid
    client = clients.get(sid)
    if not client:
        return
    room_name = client["room"]
    qubit_ids = data.get("qubit_ids", [])
    if not qubit_ids and data.get("qubit_id"):
        qubit_ids = [data.get("qubit_id")]
    target_sid = data.get("target_sid")
    mgr = rooms[room_name]["manager"]

    if target_sid not in rooms[room_name]["users"]:
        emit("action_error", {"message": "Selected recipient is not in the room."})
        return

    recipient_name = rooms[room_name]["users"][target_sid]

    try:
        metas = mgr.transfer_batch_qubits(qubit_ids, sid, target_sid)
        numbers = [f"#{m['number']}" for m in metas]
        # Notify sender
        log_quantum_event(
            room_name,
            "transmit",
            f"⚛ [Quantum Channel] You transmitted {len(metas)} qubit(s) ({', '.join(numbers)}) to {recipient_name}.",
            to_sid=sid
        )
        # Notify recipient privately
        log_quantum_event(
            room_name,
            "transmit",
            f"⚛ [Quantum Channel] Received {len(metas)} qubit(s) ({', '.join(numbers)}) from {client['username']}! (Amplitudes unknown: |ψ⟩)",
            to_sid=target_sid
        )
        broadcast_room_state(room_name)
    except Exception as e:
        emit("action_error", {"message": str(e)})


@socketio.on("measure_batch")
def handle_measure_batch(data):
    """
    Measures selected qubits against bases (Z, X, Y).
    If 1 qubit: produces a single_bit record (no batch bitstring card).
    If > 1 qubit: produces a batch_bits record with nested bit outcomes.
    """
    sid = request.sid
    client = clients.get(sid)
    if not client:
        return
    room_name = client["room"]
    qubit_ids = data.get("qubit_ids", [])
    bases = data.get("bases", "Z")
    mgr = rooms[room_name]["manager"]

    try:
        outcomes, bitstring, rec = mgr.measure_batch_qubits(qubit_ids, bases, sid)
        if len(qubit_ids) == 1:
            log_quantum_event(
                room_name,
                "measure",
                f"💥 You measured Qubit #{outcomes[0]['number']} in {outcomes[0]['basis_name']} ➔ Bit: [{bitstring}] (Collapsed to {outcomes[0]['eigenstate']})",
                to_sid=sid
            )
        else:
            log_quantum_event(
                room_name,
                "measure",
                f"💥 You batch-measured {len(outcomes)} qubits in bases [{rec['bases']}] → Bitstring: [{bitstring}]",
                to_sid=sid
            )
        emit("batch_measure_results", {
            "outcomes": outcomes,
            "bitstring": bitstring,
            "record": rec,
        })
        broadcast_room_state(room_name)
    except Exception as e:
        emit("action_error", {"message": str(e)})


@socketio.on("measure_bell")
def handle_measure_bell(data):
    """Measures two qubits in the Bell basis."""
    sid = request.sid
    client = clients.get(sid)
    if not client:
        return
    room_name = client["room"]
    control_id = data.get("control_id")
    target_id = data.get("target_id")
    mgr = rooms[room_name]["manager"]

    try:
        bell_name, mc, mt, encoded_bits, joint_rec = mgr.measure_bell(control_id, target_id, sid)
        log_quantum_event(
            room_name,
            "measure",
            f"💥 You performed Bell Measurement on Qubits #{joint_rec['qubit_a']} & #{joint_rec['qubit_b']} → State: {bell_name} | Encoded Bits: {encoded_bits} (mc={mc}, mt={mt})",
            to_sid=sid
        )
        broadcast_room_state(room_name)
    except Exception as e:
        emit("action_error", {"message": str(e)})


@socketio.on("measure_batch_bell")
def handle_measure_batch_bell(data):
    """
    Unified Bell measurement:
    - If 1 pair: only joint_bell record is created.
    - If > 1 pair: batch_bell record with nested joint records is created.
    """
    sid = request.sid
    client = clients.get(sid)
    if not client:
        return
    room_name = client["room"]
    pairs = data.get("pairs", [])
    mgr = rooms[room_name]["manager"]

    try:
        joint_results, full_bitstring, rec = mgr.measure_batch_bell(pairs, sid)
        if len(pairs) == 1:
            j = joint_results[0]
            log_quantum_event(
                room_name,
                "measure",
                f"💥 You performed Bell Measurement on Qubits #{j['qubit_a']} & #{j['qubit_b']} → State: {j['bell_state']} | Encoded Bits: {j['encoded_bits']} (mc={j['control_bit']}, mt={j['target_bit']})",
                to_sid=sid
            )
        else:
            summary_states = " ".join(j["bell_state"] for j in joint_results)
            log_quantum_event(
                room_name,
                "measure",
                f"💥 You performed Batch Bell Measurement on {len(pairs)} pairs → Decoded Bitstring: [{full_bitstring}] (States: {summary_states})",
                to_sid=sid
            )
        broadcast_room_state(room_name)
    except Exception as e:
        emit("action_error", {"message": str(e)})


@socketio.on("clear_measured")
def handle_clear_measured():
    sid = request.sid
    client = clients.get(sid)
    if not client:
        return
    room_name = client["room"]
    mgr = rooms[room_name]["manager"]
    mgr.clear_measured_bits(sid)
    broadcast_room_state(room_name)


@socketio.on("reset_room")
def handle_reset_room():
    sid = request.sid
    client = clients.get(sid)
    if not client:
        return
    room_name = client["room"]
    mgr = rooms[room_name]["manager"]
    mgr.reset()
    log_quantum_event(room_name, "system", f"⚠️ Room quantum registers were reset by {client['username']}.")
    broadcast_room_state(room_name)


# ==============================================================================
# Main Entry Point
# ==============================================================================
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Starting Quantum Channel Simulator server on http://localhost:{port}")
    socketio.run(app, host="0.0.0.0", port=port, debug=False)
