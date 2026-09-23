import os
import sys
import time
import numpy as np
from flask import Flask, render_template, request, send_from_directory
from flask_socketio import SocketIO, emit, join_room, leave_room
from qiskit.quantum_info import Statevector
from qiskit.circuit.library import HGate, XGate, ZGate, CXGate

app = Flask(__name__, template_folder="templates", static_folder="static")
app.config["SECRET_KEY"] = "quantum-sim-secret-key"

socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# Mappings of Bell States to Encoded Two-Bit Strings
BELL_TO_BITS_CONVENTION_A = {
    "|Ψ+⟩": "00",
    "|Ψ-⟩": "01",
    "|Φ+⟩": "10",
    "|Φ-⟩": "11",
}

BELL_TO_BITS_SUPERDENSE = {
    "|Φ+⟩": "00",
    "|Ψ+⟩": "01",
    "|Φ-⟩": "10",
    "|Ψ-⟩": "11",
}


# ==============================================================================
# Quantum Logic Engine (Qiskit Statevector Wrapper)
# ==============================================================================
class RoomQuantumManager:
    """
    Manages the global quantum statevector, qubit inventory, and measurements
    for a multiplayer room.
    """

    def __init__(self, room_name):
        self.room_name = room_name
        self.statevector = None          # qiskit.quantum_info.Statevector or None
        self.qubits = {}                 # qid -> qubit metadata dict
        self.qubit_counter = 0           # Auto-increment counter for visual IDs
        self.qubit_id_to_index = {}      # qid -> int index in statevector
        self.index_to_qubit_id = {}      # int index -> qid
        self.joint_measurements = []     # List of joint Bell measurement records

    def _sync_index_maps(self):
        """Rebuilds the lookup dictionaries between visual IDs and statevector indices."""
        self.qubit_id_to_index = {
            qid: meta["index"]
            for qid, meta in self.qubits.items()
            if meta["index"] is not None
        }
        self.index_to_qubit_id = {
            meta["index"]: qid
            for qid, meta in self.qubits.items()
            if meta["index"] is not None
        }

    def _slice_out_qubit(self, measured_idx, outcome_val):
        """
        Removes a collapsed qubit from the statevector via projective subspace slicing.
        Since the qubit has collapsed into pure eigenstate |0> or |1>,
        it is completely unentangled from the remaining subsystems.
        """
        if self.statevector is None:
            return
        num_qubits = self.statevector.num_qubits
        if num_qubits <= 1:
            self.statevector = None
            return

        shape = (2,) * num_qubits
        arr = self.statevector.data.reshape(shape)
        # In Qiskit, index k maps to axis (num_qubits - 1 - k)
        axis = num_qubits - 1 - measured_idx
        slc = [slice(None)] * num_qubits
        slc[axis] = outcome_val
        sliced = arr[tuple(slc)]
        norm = np.linalg.norm(sliced)
        if norm > 0:
            sliced = sliced / norm
        self.statevector = Statevector(sliced.flatten())

    def prepare_single_qubit(self, owner_sid, owner_name, state_label):
        """Prepares a single qubit in one of the predefined basis states (|0>, |1>, |+>, |->)."""
        state_label = state_label.strip()
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

        if self.statevector is None:
            self.statevector = new_sv
            backend_idx = 0
        else:
            backend_idx = self.statevector.num_qubits
            self.statevector = self.statevector.expand(new_sv)

        meta = {
            "id": qid,
            "number": self.qubit_counter,
            "index": backend_idx,
            "owner_sid": owner_sid,
            "creator_sid": owner_sid,
            "creator_name": owner_name,
            "prep_label": disp,
            "is_measured": False,
            "transferred": False,
            "measured_basis": None,
            "measured_value": None,
            "created_at": time.time(),
        }
        self.qubits[qid] = meta
        self._sync_index_maps()
        return [meta]

    def prepare_generic_state(self, owner_sid, owner_name, alpha, beta):
        """
        Prepares a generic real superposition state: |ψ⟩ = α|0⟩ + β|1⟩
        Enforces and normalizes α² + β² = 1.
        """
        try:
            alpha = float(alpha)
            beta = float(beta)
        except Exception:
            raise ValueError("Alpha and Beta must be valid numbers.")

        norm = np.sqrt(alpha**2 + beta**2)
        if norm < 1e-9:
            raise ValueError("Statevector magnitude cannot be zero.")

        # Normalize to strictly satisfy probability rule
        alpha = alpha / norm
        beta = beta / norm

        self.qubit_counter += 1
        qid = f"q{self.qubit_counter}"
        new_sv = Statevector([alpha, beta])

        if self.statevector is None:
            self.statevector = new_sv
            backend_idx = 0
        else:
            backend_idx = self.statevector.num_qubits
            self.statevector = self.statevector.expand(new_sv)

        sign_str = "+" if beta >= 0 else "-"
        disp = f"|ψ⟩ = {alpha:.3f}|0⟩ {sign_str} {abs(beta):.3f}|1⟩"

        meta = {
            "id": qid,
            "number": self.qubit_counter,
            "index": backend_idx,
            "owner_sid": owner_sid,
            "creator_sid": owner_sid,
            "creator_name": owner_name,
            "prep_label": disp,
            "is_generic": True,
            "alpha": float(alpha),
            "beta": float(beta),
            "is_measured": False,
            "transferred": False,
            "measured_basis": None,
            "measured_value": None,
            "created_at": time.time(),
        }
        self.qubits[qid] = meta
        self._sync_index_maps()
        return meta

    def prepare_bell_pair(self, owner_sid, owner_name, bell_type):
        """Prepares an entangled two-qubit Bell State (|Φ+>, |Φ->, |Ψ+>, |Ψ->)."""
        bell_type = bell_type.lower().strip()
        base = Statevector.from_label("00").evolve(HGate(), [0]).evolve(CXGate(), [0, 1])

        if bell_type in ("phi+", "phi_plus", "b00"):
            bell_sv = base
            disp = "|Φ+⟩"
        elif bell_type in ("phi-", "phi_minus", "b10"):
            bell_sv = base.evolve(ZGate(), [0])
            disp = "|Φ-⟩"
        elif bell_type in ("psi+", "psi_plus", "b01"):
            bell_sv = base.evolve(XGate(), [1])
            disp = "|Ψ+⟩"
        elif bell_type in ("psi-", "psi_minus", "b11"):
            bell_sv = base.evolve(ZGate(), [0]).evolve(XGate(), [1])
            disp = "|Ψ-⟩"
        else:
            raise ValueError(f"Unknown Bell state type: {bell_type}")

        self.qubit_counter += 1
        qid1 = f"q{self.qubit_counter}"
        self.qubit_counter += 1
        qid2 = f"q{self.qubit_counter}"

        if self.statevector is None:
            self.statevector = bell_sv
            idx1 = 0
            idx2 = 1
        else:
            idx1 = self.statevector.num_qubits
            idx2 = idx1 + 1
            self.statevector = self.statevector.expand(bell_sv)

        meta1 = {
            "id": qid1,
            "number": self.qubit_counter - 1,
            "index": idx1,
            "owner_sid": owner_sid,
            "creator_sid": owner_sid,
            "creator_name": owner_name,
            "prep_label": f"{disp} (Entangled Part A)",
            "paired_with": qid2,
            "is_measured": False,
            "transferred": False,
            "measured_basis": None,
            "measured_value": None,
            "created_at": time.time(),
        }
        meta2 = {
            "id": qid2,
            "number": self.qubit_counter,
            "index": idx2,
            "owner_sid": owner_sid,
            "creator_sid": owner_sid,
            "creator_name": owner_name,
            "prep_label": f"{disp} (Entangled Part B)",
            "paired_with": qid1,
            "is_measured": False,
            "transferred": False,
            "measured_basis": None,
            "measured_value": None,
            "created_at": time.time(),
        }

        self.qubits[qid1] = meta1
        self.qubits[qid2] = meta2
        self._sync_index_maps()
        return [meta1, meta2]

    def batch_encode_qubits(self, owner_sid, owner_name, bits_str, bases_str):
        """
        Automatizes qubit encoding:
        Bit sequence + Basis sequence = Encoded qubit sequence.
        (e.g., bits='0110', bases='ZXXZ' -> |0>, |->, |->, |0>)
        """
        bits = [c for c in bits_str if c in ("0", "1")]
        bases = [c.upper() for c in bases_str if c.upper() in ("Z", "X")]

        if not bits:
            raise ValueError("Bit sequence cannot be empty (must contain '0' or '1').")
        if len(bits) != len(bases):
            raise ValueError(f"Bit sequence length ({len(bits)}) does not match basis sequence length ({len(bases)}).")

        created = []
        for bit, basis in zip(bits, bases):
            if basis == "Z":
                state_lbl = bit
            else:
                state_lbl = "+" if bit == "0" else "-"
            metas = self.prepare_single_qubit(owner_sid, owner_name, state_lbl)
            created.append(metas[0])

        return created

    def apply_single_gate(self, qid, gate_name, caller_sid):
        """Applies a 1-qubit gate (X, Z, H) to an active qubit owned by caller."""
        meta = self.qubits.get(qid)
        if not meta:
            raise ValueError(f"Qubit {qid} not found.")
        if meta["owner_sid"] != caller_sid:
            raise PermissionError("You can only manipulate qubits in your inventory.")
        if meta["is_measured"]:
            raise ValueError(f"Qubit #{meta['number']} has already been measured.")

        idx = meta["index"]
        gate_name = gate_name.upper().strip()
        if gate_name == "X":
            gate = XGate()
        elif gate_name == "Z":
            gate = ZGate()
        elif gate_name == "H":
            gate = HGate()
        else:
            raise ValueError(f"Gate {gate_name} not supported. Use X, Z, or H.")

        self.statevector = self.statevector.evolve(gate, [idx])
        return meta

    def apply_batch_gate(self, qubit_ids, gate_name, caller_sid):
        """Applies a 1-qubit gate (X, Z, H) to multiple selected qubits owned by caller."""
        if not qubit_ids:
            raise ValueError("No qubits selected for gate application.")
        metas = []
        for qid in qubit_ids:
            meta = self.apply_single_gate(qid, gate_name, caller_sid)
            metas.append(meta)
        return metas

    def apply_cnot(self, control_qid, target_qid, caller_sid):
        """Applies a 2-qubit CNOT gate following the strict Control-Target rule."""
        if control_qid == target_qid:
            raise ValueError("Control and Target must be distinct qubits.")

        c_meta = self.qubits.get(control_qid)
        t_meta = self.qubits.get(target_qid)
        if not c_meta or not t_meta:
            raise ValueError("One or both specified qubits were not found.")
        if c_meta["owner_sid"] != caller_sid or t_meta["owner_sid"] != caller_sid:
            raise PermissionError("You must own both qubits to apply a two-qubit gate.")
        if c_meta["is_measured"] or t_meta["is_measured"]:
            raise ValueError("Cannot apply gates to measured qubits.")

        c_idx = c_meta["index"]
        t_idx = t_meta["index"]
        self.statevector = self.statevector.evolve(CXGate(), [c_idx, t_idx])
        return c_meta, t_meta

    def transfer_qubit(self, qid, from_sid, to_sid):
        """Transfers single qubit ownership across the quantum channel."""
        meta = self.qubits.get(qid)
        if not meta:
            raise ValueError(f"Qubit {qid} not found.")
        if meta["owner_sid"] != from_sid:
            raise PermissionError("You do not own this qubit.")
        if meta["is_measured"]:
            raise ValueError("Cannot transfer a measured qubit.")

        meta["owner_sid"] = to_sid
        meta["transferred"] = True
        return meta

    def transfer_batch_qubits(self, qubit_ids, from_sid, to_sid):
        """Transfers multiple qubits in a single batch transmission."""
        if not qubit_ids:
            raise ValueError("No qubits selected for transmission.")
        transferred = []
        for qid in qubit_ids:
            meta = self.transfer_qubit(qid, from_sid, to_sid)
            transferred.append(meta)
        return transferred

    def sample_qubit_state(self, qid, caller_sid, shots=1000):
        """
        Executes quantum state sampling / tomography on a selected qubit.
        Allows the recipient of an unknown state to estimate |α|² and |β|² via shot statistics.
        """
        meta = self.qubits.get(qid)
        if not meta:
            raise ValueError(f"Qubit {qid} not found.")
        if meta["owner_sid"] != caller_sid:
            raise PermissionError("You can only sample qubits in your inventory.")
        if meta["is_measured"]:
            raise ValueError("Cannot sample a measured qubit.")

        idx = meta["index"]
        p0, p1 = self.statevector.probabilities([idx])
        shots = max(10, min(10000, int(shots)))
        counts = np.random.multinomial(shots, [p0, p1])

        # Also sample in Diagonal (X) basis
        temp_x = self.statevector.evolve(HGate(), [idx])
        px0, px1 = temp_x.probabilities([idx])
        counts_x = np.random.multinomial(shots, [px0, px1])

        return {
            "qubit_id": qid,
            "qubit_number": meta["number"],
            "shots": shots,
            "z_counts": {"0": int(counts[0]), "1": int(counts[1])},
            "z_freq": {"0": float(counts[0] / shots), "1": float(counts[1] / shots)},
            "x_counts": {"+": int(counts_x[0]), "-": int(counts_x[1])},
            "x_freq": {"+": float(counts_x[0] / shots), "-": float(counts_x[1] / shots)},
            "est_alpha": float(np.sqrt(counts[0] / shots)),
            "est_beta": float(np.sqrt(counts[1] / shots)),
        }

    def measure_qubit(self, qid, basis, caller_sid):
        """
        Measures a single qubit in either Computational (Z) or Diagonal (X) basis.
        Diagonal basis outcome displays strictly '+' or '-'.
        """
        meta = self.qubits.get(qid)
        if not meta:
            raise ValueError(f"Qubit {qid} not found.")
        if meta["owner_sid"] != caller_sid:
            raise PermissionError("You do not own this qubit.")
        if meta["is_measured"]:
            raise ValueError("Qubit has already been measured.")

        idx = meta["index"]
        basis = basis.upper().strip()

        if basis == "Z":
            outcome, collapsed_sv = self.statevector.measure([idx])
            val = int(outcome)
            disp_result = str(val)  # "0" or "1"
            basis_name = "Computational (Z)"
            self.statevector = collapsed_sv
            self._slice_out_qubit(idx, val)

        elif basis == "X":
            temp_sv = self.statevector.evolve(HGate(), [idx])
            outcome, collapsed_sv = temp_sv.measure([idx])
            val = int(outcome)
            disp_result = "+" if val == 0 else "-"  # Strictly '+' or '-'
            basis_name = "Diagonal (X)"
            self.statevector = collapsed_sv
            self._slice_out_qubit(idx, val)
        else:
            raise ValueError(f"Unknown single-qubit measurement basis: {basis}")

        meta["is_measured"] = True
        meta["index"] = None
        meta["measured_basis"] = basis_name
        meta["measured_value"] = disp_result

        # Decrement indices of remaining active qubits with higher index
        for q, m in self.qubits.items():
            if m["index"] is not None and m["index"] > idx:
                m["index"] -= 1

        self._sync_index_maps()
        return meta, disp_result, basis_name

    def measure_batch_qubits(self, qubit_ids, bases_input, caller_sid):
        """
        Measures a sequence of qubits against a sequence of bases.
        (Encoded qubit sequence + basis sequence = measurement outcome sequence).
        """
        if not qubit_ids:
            raise ValueError("No qubits selected for batch measurement.")

        clean_bases = [c.upper() for c in bases_input if c.upper() in ("Z", "X")]
        if len(clean_bases) == 1:
            bases_list = clean_bases * len(qubit_ids)
        elif len(clean_bases) == len(qubit_ids):
            bases_list = clean_bases
        else:
            raise ValueError(f"Bases count ({len(clean_bases)}) must equal 1 or the qubit count ({len(qubit_ids)}).")

        # Collect target qubits and their current backend indices
        items = []
        for qid, basis in zip(qubit_ids, bases_list):
            meta = self.qubits.get(qid)
            if not meta:
                raise ValueError(f"Qubit {qid} not found.")
            if meta["owner_sid"] != caller_sid:
                raise PermissionError("You can only measure qubits in your inventory.")
            if meta["is_measured"]:
                raise ValueError(f"Qubit #{meta['number']} is already measured.")
            items.append((qid, basis, meta["index"], meta["number"]))

        # Measure in reverse order of backend indices so higher indices slice without shifting lower ones
        sorted_items = sorted(items, key=lambda x: x[2], reverse=True)
        results = {}

        for qid, basis, _, _ in sorted_items:
            meta, disp_result, basis_name = self.measure_qubit(qid, basis, caller_sid)
            results[qid] = {
                "id": qid,
                "number": meta["number"],
                "basis": basis,
                "outcome": disp_result,
            }

        ordered_outcomes = [results[qid] for qid in qubit_ids]
        return ordered_outcomes

    def measure_bell(self, control_qid, target_qid, caller_sid):
        """
        Performs a two-qubit Bell Basis measurement:
        CNOT(control, target) -> H(control) -> Computational Measurement.
        Collapses both qubits and records a joint Bell measurement result in the classical register.
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

        c_idx = c_meta["index"]
        t_idx = t_meta["index"]

        b_sv = self.statevector.evolve(CXGate(), [c_idx, t_idx]).evolve(HGate(), [c_idx])
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

        self.statevector = post_t

        # Remove higher index first so lower index remains valid
        first_idx, first_val = (c_idx, mc) if c_idx > t_idx else (t_idx, mt)
        second_idx, second_val = (t_idx, mt) if c_idx > t_idx else (c_idx, mc)

        self._slice_out_qubit(first_idx, first_val)
        self._slice_out_qubit(second_idx, second_val)

        encoded_bits_a = BELL_TO_BITS_CONVENTION_A.get(bell_name, "00")
        dense_bits = BELL_TO_BITS_SUPERDENSE.get(bell_name, "00")

        # Mark both individual qubits as collapsed
        c_meta["is_measured"] = True
        c_meta["index"] = None
        c_meta["measured_basis"] = "Bell Basis"
        c_meta["measured_value"] = f"{bell_name} (Bit: {mc})"

        t_meta["is_measured"] = True
        t_meta["index"] = None
        t_meta["measured_basis"] = "Bell Basis"
        t_meta["measured_value"] = f"{bell_name} (Bit: {mt})"

        # Re-index remaining active qubits
        for rem_idx in sorted([first_idx, second_idx], reverse=True):
            for q, m in self.qubits.items():
                if m["index"] is not None and m["index"] > rem_idx:
                    m["index"] -= 1

        self._sync_index_maps()

        # Create Unified Joint Bell Measurement outcome card (Lecture Order: Qubit A & Qubit B)
        qubit_a_num = min(c_meta["number"], t_meta["number"])
        qubit_b_num = max(c_meta["number"], t_meta["number"])
        joint_record = {
            "id": f"bell_{c_meta['id']}_{t_meta['id']}",
            "is_joint_bell": True,
            "qubit_a": qubit_a_num,
            "qubit_b": qubit_b_num,
            "control_qubit": c_meta["number"],
            "target_qubit": t_meta["number"],
            "bell_state": bell_name,
            "encoded_bits": encoded_bits_a,
            "dense_bits": dense_bits,
            "control_bit": mc,
            "target_bit": mt,
            "owner_sid": caller_sid,
            "timestamp": time.strftime("%H:%M:%S"),
        }
        self.joint_measurements.append(joint_record)

        return bell_name, mc, mt, encoded_bits_a, joint_record

    def get_user_inventory(self, user_sid):
        """
        Returns sanitized inventory list for a specific user:
        - Active qubits (with unknown labels for transferred ones)
        - Single classical bits
        - Joint Bell measurement outcomes
        """
        active_qubits = []
        classical_bits = []

        for qid, meta in sorted(self.qubits.items(), key=lambda x: x[1]["number"]):
            if meta["owner_sid"] == user_sid:
                if meta["is_measured"]:
                    classical_bits.append({
                        "id": meta["id"],
                        "number": meta["number"],
                        "basis": meta["measured_basis"],
                        "value": meta["measured_value"],
                    })
                else:
                    is_unknown = meta["transferred"] or (meta["creator_sid"] != user_sid)
                    active_qubits.append({
                        "id": meta["id"],
                        "number": meta["number"],
                        "is_unknown": is_unknown,
                        "label": "Unknown Qubit |ψ⟩" if is_unknown else meta["prep_label"],
                        "creator": meta["creator_name"],
                    })

        user_joints = [
            j for j in self.joint_measurements
            if j["owner_sid"] == user_sid
        ]

        return active_qubits, classical_bits, user_joints

    def clear_measured_bits(self, user_sid):
        """Removes measured classical bits and joint Bell outcomes from a user's view."""
        to_delete = [
            qid for qid, meta in self.qubits.items()
            if meta["owner_sid"] == user_sid and meta["is_measured"]
        ]
        for qid in to_delete:
            del self.qubits[qid]

        self.joint_measurements = [
            j for j in self.joint_measurements
            if j["owner_sid"] != user_sid
        ]

    def reset(self):
        """Wipes the quantum state and resets counters for the room."""
        self.statevector = None
        self.qubits.clear()
        self.qubit_counter = 0
        self.qubit_id_to_index.clear()
        self.index_to_qubit_id.clear()
        self.joint_measurements.clear()


# ==============================================================================
# Global Room & Connection State
# ==============================================================================
rooms = {}    # room_name -> {'manager': RoomQuantumManager, 'users': {sid: username}}
clients = {}  # sid -> {'username': str, 'room': str}


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
    """Broadcasts room metadata, user lists, and per-user sanitized inventories."""
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
        active, classical, joints = mgr.get_user_inventory(sid)
        emit("inventory_update", {
            "active_qubits": active,
            "classical_bits": classical,
            "joint_bell_outcomes": joints,
        }, to=sid)


def log_quantum_event(room_name, event_type, message):
    """Appends an event to the room's quantum activity log and broadcasts it."""
    if room_name not in rooms:
        return
    event = {
        "type": event_type,
        "message": message,
        "timestamp": time.strftime("%H:%M:%S"),
    }
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
    """Classical communication channel (e.g. for sharing measurement bases in QKD or bits in Teleportation)."""
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
    """Prepares predefined single-qubit states or Bell states."""
    sid = request.sid
    client = clients.get(sid)
    if not client:
        return
    room_name = client["room"]
    state_type = data.get("state_type")
    mgr = rooms[room_name]["manager"]

    try:
        if state_type in ("0", "1", "+", "-"):
            metas = mgr.prepare_single_qubit(sid, client["username"], state_type)
            log_quantum_event(
                room_name,
                "prepare",
                f"{client['username']} prepared state {metas[0]['prep_label']} → Qubit #{metas[0]['number']}"
            )
        elif state_type in ("phi+", "phi-", "psi+", "psi-"):
            metas = mgr.prepare_bell_pair(sid, client["username"], state_type)
            log_quantum_event(
                room_name,
                "prepare",
                f"{client['username']} prepared Bell pair {metas[0]['prep_label']} → Allocated Qubits #{metas[0]['number']} and #{metas[1]['number']}"
            )
        else:
            emit("action_error", {"message": f"Invalid state type: {state_type}"})
            return

        broadcast_room_state(room_name)
    except Exception as e:
        emit("action_error", {"message": str(e)})


@socketio.on("prepare_generic_state")
def handle_prepare_generic_state(data):
    """Prepares an arbitrary real superposition state: |ψ⟩ = α|0⟩ + β|1⟩."""
    sid = request.sid
    client = clients.get(sid)
    if not client:
        return
    room_name = client["room"]
    alpha = data.get("alpha", 1.0)
    beta = data.get("beta", 0.0)
    mgr = rooms[room_name]["manager"]

    try:
        meta = mgr.prepare_generic_state(sid, client["username"], alpha, beta)
        log_quantum_event(
            room_name,
            "prepare",
            f"{client['username']} prepared Generic State {meta['prep_label']} → Qubit #{meta['number']}"
        )
        broadcast_room_state(room_name)
    except Exception as e:
        emit("action_error", {"message": str(e)})


@socketio.on("sample_state")
def handle_sample_state(data):
    """Executes state sampling / tomography on a selected qubit."""
    sid = request.sid
    client = clients.get(sid)
    if not client:
        return
    room_name = client["room"]
    qubit_id = data.get("qubit_id")
    shots = data.get("shots", 1000)
    mgr = rooms[room_name]["manager"]

    try:
        sample_results = mgr.sample_qubit_state(qubit_id, sid, shots)
        emit("sample_results", sample_results)
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
            f"{client['username']} batch-encoded {len(created)} qubits (Bits: '{bits}', Bases: '{bases}') → Qubits {', '.join(numbers)}"
        )
        broadcast_room_state(room_name)
    except Exception as e:
        emit("action_error", {"message": str(e)})


@socketio.on("apply_gate")
def handle_apply_gate(data):
    """Applies a 1-qubit gate (X, Z, H) to one or multiple qubits."""
    sid = request.sid
    client = clients.get(sid)
    if not client:
        return
    room_name = client["room"]
    qubit_id = data.get("qubit_id")
    qubit_ids = data.get("qubit_ids", [])
    gate = data.get("gate", "").upper()
    mgr = rooms[room_name]["manager"]

    targets = qubit_ids if qubit_ids else ([qubit_id] if qubit_id else [])
    if not targets:
        emit("action_error", {"message": "No qubits specified."})
        return

    try:
        metas = mgr.apply_batch_gate(targets, gate, sid)
        numbers = [f"#{m['number']}" for m in metas]
        log_quantum_event(
            room_name,
            "gate",
            f"{client['username']} applied Gate '{gate}' to Qubits: {', '.join(numbers)}"
        )
        broadcast_room_state(room_name)
    except Exception as e:
        emit("action_error", {"message": str(e)})


@socketio.on("apply_cnot")
def handle_apply_cnot(data):
    """Applies a 2-qubit CNOT gate (Control -> Target)."""
    sid = request.sid
    client = clients.get(sid)
    if not client:
        return
    room_name = client["room"]
    control_id = data.get("control_id")
    target_id = data.get("target_id")
    mgr = rooms[room_name]["manager"]

    try:
        c_meta, t_meta = mgr.apply_cnot(control_id, target_id, sid)
        log_quantum_event(
            room_name,
            "gate",
            f"{client['username']} applied CNOT Gate (Control: Qubit #{c_meta['number']}, Target: Qubit #{t_meta['number']})"
        )
        broadcast_room_state(room_name)
    except Exception as e:
        emit("action_error", {"message": str(e)})


@socketio.on("send_qubit")
def handle_send_qubit(data):
    """Transmits single or multiple qubits through the quantum channel to another node."""
    sid = request.sid
    client = clients.get(sid)
    if not client:
        return
    room_name = client["room"]
    qubit_id = data.get("qubit_id")
    qubit_ids = data.get("qubit_ids", [])
    target_sid = data.get("target_sid")
    mgr = rooms[room_name]["manager"]

    if target_sid not in rooms[room_name]["users"]:
        emit("action_error", {"message": "Selected recipient is not in the room."})
        return

    recipient_name = rooms[room_name]["users"][target_sid]
    targets = qubit_ids if qubit_ids else ([qubit_id] if qubit_id else [])
    if not targets:
        emit("action_error", {"message": "No qubits specified for transmission."})
        return

    try:
        metas = mgr.transfer_batch_qubits(targets, sid, target_sid)
        numbers = [f"#{m['number']}" for m in metas]
        log_quantum_event(
            room_name,
            "transmit",
            f"⚛ [Quantum Channel] {client['username']} transmitted {len(metas)} qubit(s) ({', '.join(numbers)}) to {recipient_name}! ({recipient_name} received |ψ⟩ sequence)"
        )
        broadcast_room_state(room_name)
    except Exception as e:
        emit("action_error", {"message": str(e)})


@socketio.on("measure_qubit")
def handle_measure_qubit(data):
    """Measures a single qubit in Z or X basis."""
    sid = request.sid
    client = clients.get(sid)
    if not client:
        return
    room_name = client["room"]
    qubit_id = data.get("qubit_id")
    basis = data.get("basis", "Z")
    mgr = rooms[room_name]["manager"]

    try:
        meta, result, basis_name = mgr.measure_qubit(qubit_id, basis, sid)
        log_quantum_event(
            room_name,
            "measure",
            f"💥 {client['username']} measured Qubit #{meta['number']} in {basis_name} basis → Collapsed to: {result}"
        )
        broadcast_room_state(room_name)
    except Exception as e:
        emit("action_error", {"message": str(e)})


@socketio.on("measure_batch")
def handle_measure_batch(data):
    """Measures multiple selected qubits against a sequence of bases."""
    sid = request.sid
    client = clients.get(sid)
    if not client:
        return
    room_name = client["room"]
    qubit_ids = data.get("qubit_ids", [])
    bases = data.get("bases", "Z")
    mgr = rooms[room_name]["manager"]

    try:
        outcomes = mgr.measure_batch_qubits(qubit_ids, bases, sid)
        seq_str = " ".join([o["outcome"] for o in outcomes])
        bases_str = " ".join([o["basis"] for o in outcomes])
        log_quantum_event(
            room_name,
            "measure",
            f"💥 {client['username']} batch-measured {len(outcomes)} qubits in bases [{bases_str}] → Outcome sequence: [{seq_str}]"
        )
        emit("batch_measure_results", {
            "outcomes": outcomes,
            "sequence": seq_str,
            "bases": bases_str,
        })
        broadcast_room_state(room_name)
    except Exception as e:
        emit("action_error", {"message": str(e)})


@socketio.on("measure_bell")
def handle_measure_bell(data):
    """Measures two qubits in the Bell basis and logs joint representation."""
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
            f"💥 {client['username']} performed Bell Measurement on Qubits #{joint_rec['qubit_a']} & #{joint_rec['qubit_b']} → State: {bell_name} | Encoded Bits: {encoded_bits} (Lecture order: mc={mc}, mt={mt})"
        )
        broadcast_room_state(room_name)
    except Exception as e:
        emit("action_error", {"message": str(e)})


@socketio.on("clear_measured")
def handle_clear_measured():
    """Cleans up measured classical bits in the calling user's inventory."""
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
    """Resets the quantum state and qubits for the entire room."""
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
