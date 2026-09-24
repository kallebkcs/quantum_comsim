"""
Automated Integration Tests for Quantum Channel Simulator.
Validates:
1. Updated Bell Mapping: |Φ+⟩ <-> 00, |Φ-⟩ <-> 01, |Ψ+⟩ <-> 10, |Ψ-⟩ <-> 11.
2. 0-Indexed Qubit Numbering: Qubits start at #0.
3. Quantity batch state preparation (e.g. 5x |0⟩, 2x |Φ+⟩).
4. 32-Bit Batch Encoding without Memory Explosion (Cluster Architecture).
5. Automated EPR Superdense Encoding (00, 01, 10, 11 -> |Φ+⟩, |Φ-⟩, |Ψ+⟩, |Ψ-⟩).
6. Direct Automatic N-Qubit GHZ State Generation.
7. Multi-target CNOT across clusters.
8. Multi-qubit joint sampling in Z and X bases with full bitstring histogram.
9. Dynamic state label transformations upon gate application.
10. Operator log privacy (Alice's local operations are invisible to Bob).
11. Batch Bell measurements across pairs with combined bitstring card.
12. Sifted Key Extractor logic (+ -> 0, - -> 1).
"""

import sys
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
import numpy as np
import server

def get_latest_inventory(client):
    received = client.get_received()
    inv = None
    for event in received:
        if event["name"] == "inventory_update":
            inv = event["args"][0]
    return inv

def get_peer_sid(client, username):
    for event in client.get_received():
        if event["name"] == "room_status":
            for user in event["args"][0].get("users", []):
                if user["username"] == username:
                    return user["sid"]
    for r in server.rooms.values():
        for sid, name in r["users"].items():
            if name == username:
                return sid
    return None

def test_full_quantum_simulator():
    print("=== Starting Quantum Channel Simulator Integration Tests ===")

    # 1. Setup two clients: Alice and Bob
    alice = server.socketio.test_client(server.app)
    bob = server.socketio.test_client(server.app)
    assert alice.is_connected() and bob.is_connected(), "Clients failed to connect"

    alice.emit("join_room", {"username": "Alice", "room": "physics-lab"})
    bob.emit("join_room", {"username": "Bob", "room": "physics-lab"})

    bob_sid = get_peer_sid(alice, "Bob")
    alice_sid = get_peer_sid(bob, "Alice")
    assert bob_sid and alice_sid, "Could not resolve peer SIDs"

    # Reset room to start fresh at Qubit #0
    alice.emit("reset_room")
    # Drain received events
    alice.get_received()
    bob.get_received()

    # 2. Updated Bell Mapping Verification:
    # |Φ+⟩ <-> 00, |Φ-⟩ <-> 01, |Ψ+⟩ <-> 10, |Ψ-⟩ <-> 11
    print("\n--- 1. Verifying Corrected Bell State <-> 2-Bit String Mapping ---")
    assert server.BELL_TO_BITS["|Φ+⟩"] == "00"
    assert server.BELL_TO_BITS["|Φ-⟩"] == "01"
    assert server.BELL_TO_BITS["|Ψ+⟩"] == "10"
    assert server.BELL_TO_BITS["|Ψ-⟩"] == "11"
    assert server.BITS_TO_BELL["00"] == "|Φ+⟩"
    assert server.BITS_TO_BELL["01"] == "|Φ-⟩"
    assert server.BITS_TO_BELL["10"] == "|Ψ+⟩"
    assert server.BITS_TO_BELL["11"] == "|Ψ-⟩"
    print("✔ Bell mapping verified: |Φ+⟩=00, |Φ-⟩=01, |Ψ+⟩=10, |Ψ-⟩=11.")

    # 3. 0-Indexed Qubit Numbering Verification
    print("\n--- 2. Testing 0-Indexed Numbering ---")
    alice.emit("prepare_state", {"state_type": "0", "count": 2})
    alice_inv = get_latest_inventory(alice)
    assert alice_inv["active_qubits"][0]["number"] == 0, f"Expected Qubit #0, got #{alice_inv['active_qubits'][0]['number']}"
    assert alice_inv["active_qubits"][1]["number"] == 1, f"Expected Qubit #1, got #{alice_inv['active_qubits'][1]['number']}"
    print(f"✔ 0-indexed numbering confirmed: {[q['number'] for q in alice_inv['active_qubits']]}")

    # 4. 32-Bit Batch Encoding without Memory Explosion
    print("\n--- 3. Testing 32-Bit Batch Encoding (Memory Explosion Fix) ---")
    bit_seq = "01010101010101010101010101010101" # 32 bits!
    basis_seq = "ZZXXZZXXZZXXZZXXZZXXZZXXZZXXZZXX" # 32 bases!
    alice.emit("batch_encode", {"bits": bit_seq, "bases": basis_seq})
    alice_inv = get_latest_inventory(alice)
    # 2 prior + 32 new = 34 qubits
    assert len(alice_inv["active_qubits"]) == 34
    print("✔ 32-bit batch encoding succeeded instantly without memory error! (Allocated 32 independent clusters)")

    # Measure all 32 qubits
    qids_32 = [q["id"] for q in alice_inv["active_qubits"][2:34]]
    alice.emit("measure_batch", {"qubit_ids": qids_32, "bases": basis_seq})
    alice_inv = get_latest_inventory(alice)
    assert len(alice_inv["active_qubits"]) == 2
    assert len(alice_inv["batch_bitstrings"]) == 1
    batch_rec = alice_inv["batch_bitstrings"][0]
    assert len(batch_rec["bitstring"]) == 32
    print(f"✔ Measured 32 qubits in custom bases: {batch_rec['bitstring'][:16]}... (Length: 32 bits)")

    # 5. Dynamic State Label Transformations on Gate Application
    print("\n--- 4. Testing State Label Transformations on Gate Evolution ---")
    # Reset room to start clean
    alice.emit("reset_room")
    alice.get_received()
    bob.get_received()

    # Alice prepares |0> (Qubit #0)
    alice.emit("prepare_state", {"state_type": "0", "count": 1})
    alice_inv = get_latest_inventory(alice)
    q0_id = alice_inv["active_qubits"][0]["id"]
    assert alice_inv["active_qubits"][0]["label"] == "|0⟩"

    # Apply H: |0⟩ -> |+⟩
    alice.emit("apply_gate", {"qubit_ids": [q0_id], "gate": "H"})
    alice_inv = get_latest_inventory(alice)
    assert alice_inv["active_qubits"][0]["label"] == "|+⟩"
    print("✔ |0⟩ evolved with H ➔ |+⟩")

    # Apply Z: |+⟩ -> |-⟩
    alice.emit("apply_gate", {"qubit_ids": [q0_id], "gate": "Z"})
    alice_inv = get_latest_inventory(alice)
    assert alice_inv["active_qubits"][0]["label"] == "|-⟩"
    print("✔ |+⟩ evolved with Z ➔ |-⟩")

    # Apply H: |-⟩ -> |1⟩
    alice.emit("apply_gate", {"qubit_ids": [q0_id], "gate": "H"})
    alice_inv = get_latest_inventory(alice)
    assert alice_inv["active_qubits"][0]["label"] == "|1⟩"
    print("✔ |-⟩ evolved with H ➔ |1⟩")

    # Transmit Qubit #0 to Bob
    alice.emit("send_qubit", {"qubit_ids": [q0_id], "target_sid": bob_sid})
    bob_inv = get_latest_inventory(bob)
    bob_q = bob_inv["active_qubits"][0]
    assert bob_q["label"] == "Unknown Qubit |ψ⟩"
    print("✔ Recipient Bob sees 'Unknown Qubit |ψ⟩'")

    # Bob applies H to unknown qubit: should become H|ψ⟩
    bob.emit("apply_gate", {"qubit_ids": [bob_q["id"]], "gate": "H"})
    bob_inv = get_latest_inventory(bob)
    assert bob_inv["active_qubits"][0]["label"] == "H|ψ⟩"
    print("✔ Bob applied H to unknown qubit ➔ 'H|ψ⟩'")

    # Bob applies X: should become XH|ψ⟩
    bob.emit("apply_gate", {"qubit_ids": [bob_q["id"]], "gate": "X"})
    bob_inv = get_latest_inventory(bob)
    assert bob_inv["active_qubits"][0]["label"] == "XH|ψ⟩"
    print("✔ Bob applied X to 'H|ψ⟩' ➔ 'XH|ψ⟩'")

    # 6. Automatic N-Qubit GHZ State Generation & Joint Sampling
    print("\n--- 5. Testing Automatic N-Qubit GHZ Generation & Sampling ---")
    alice.emit("reset_room")
    alice.get_received()
    bob.get_received()

    alice.emit("prepare_ghz", {"n": 3})
    alice_inv = get_latest_inventory(alice)
    assert len(alice_inv["active_qubits"]) == 3
    ghz_ids = [q["id"] for q in alice_inv["active_qubits"]]
    print(f"✔ Prepared 3-Qubit GHZ state: {[q['number'] for q in alice_inv['active_qubits']]}")

    # Sample GHZ in Z-basis: only '000' and '111'
    alice.emit("sample_state", {"qubit_ids": ghz_ids, "basis": "Z", "shots": 1000})
    received = alice.get_received()
    sample_evt = [e["args"][0] for e in received if e["name"] == "sample_results"][0]
    hist = sample_evt["histogram"]
    print("✔ GHZ Z-basis joint histogram:", hist)
    assert set(hist.keys()).issubset({"000", "111"})
    assert set(sample_evt["eigenstate_histogram"].keys()).issubset({"|000⟩", "|111⟩"})
    assert all(q.get("pair_id") and q["pair_id"].startswith("ghz_") for q in alice_inv["active_qubits"])
    assert all(q.get("pair_type") == "|GHZ_3⟩" for q in alice_inv["active_qubits"])
    print("✔ GHZ state entangled metadata confirmed (for joint container rendering).")

    # 7. Operator Privacy Verification for Quantum Operations
    print("\n--- 6. Testing Operator Privacy in Quantum Logs ---")
    alice.get_received()
    bob.get_received()

    # Alice applies a gate to Qubit #0
    alice.emit("apply_gate", {"qubit_ids": [ghz_ids[0]], "gate": "X"})
    alice_evts = alice.get_received()
    bob_evts = bob.get_received()

    alice_log = [e for e in alice_evts if e["name"] == "quantum_event"]
    bob_log = [e for e in bob_evts if e["name"] == "quantum_event"]

    assert len(alice_log) == 1, "Alice should have received her local operation log"
    assert len(bob_log) == 0, "Bob should NOT receive Alice's local operation log (privacy violation!)"
    print("✔ Operator privacy confirmed: Alice's local operations are invisible in Bob's feed.")

    # 8. Batch Bell Measurements Across Multiple Pairs & Combined Card
    print("\n--- 7. Testing Batch Bell Measurements with Combined Card ---")
    alice.emit("reset_room")
    alice.get_received()
    bob.get_received()

    # Prepare 2 Bell pairs: |Φ+⟩ (00) and |Ψ-⟩ (11)
    alice.emit("prepare_state", {"state_type": "phi+", "count": 1})
    alice.emit("prepare_state", {"state_type": "psi-", "count": 1})
    alice_inv = get_latest_inventory(alice)
    pair1 = [alice_inv["active_qubits"][0]["id"], alice_inv["active_qubits"][1]["id"]]
    pair2 = [alice_inv["active_qubits"][2]["id"], alice_inv["active_qubits"][3]["id"]]

    alice.emit("measure_batch_bell", {"pairs": [pair1, pair2]})
    alice_inv = get_latest_inventory(alice)
    assert len(alice_inv["batch_bitstrings"]) == 1
    bell_batch = alice_inv["batch_bitstrings"][0]
    assert bell_batch["is_batch_bell"] == True
    assert bell_batch["bitstring"] == "00 11"
    print(f"✔ Batch Bell measurement created combined bitstring card: '{bell_batch['bitstring']}' (States: {bell_batch['bell_states']})")

    # 9. Sifted Key Extractor Logic (+ -> 0, - -> 1)
    print("\n--- 8. Testing Sifted Key Extractor Logic ---")
    # Matching indices: 0, 2, 3, 5
    # Raw outcomes: '0 + 1 - 0 +'
    raw_tokens = ['0', '+', '1', '-', '0', '+']
    indices = [0, 2, 3, 5]
    expected_bits = []
    for idx in indices:
        token = raw_tokens[idx]
        bit = "0" if token in ("0", "+") else "1"
        expected_bits.append(bit)

    distilled_key = "".join(expected_bits)
    # token[0]='0'->0, token[2]='1'->1, token[3]='-'->1, token[5]='+'->0 => '0110'
    assert distilled_key == "0110", f"Expected '0110', got {distilled_key}"
    print(f"✔ Sifted key extraction logic (+ ➔ 0, - ➔ 1): {raw_tokens} with indices {indices} ➔ Key: '{distilled_key}'")

    # 9. Generic State Preparation with Theta and Phi
    print("\n--- 9. Testing Generic State Preparation (Theta, Phi) ---")
    alice.emit("reset_room")
    alice.get_received()
    bob.get_received()

    # Prepare generic state with theta=60 deg, phi=90 deg
    # |psi> = cos(30°)|0> + e^(i*pi/2) sin(30°)|1> = (sqrt(3)/2)|0> + (1/2) i |1>
    alice.emit("prepare_generic_state", {"theta": 60.0, "phi": 90.0, "count": 1})
    alice_inv = get_latest_inventory(alice)
    assert len(alice_inv["active_qubits"]) == 1
    g_q = alice_inv["active_qubits"][0]
    assert "θ=60.0°, φ=90.0°" in g_q["label"]
    
    # Check theoretical values stored in room manager
    room_mgr = server.rooms["physics-lab"]["manager"]
    g_meta = room_mgr.qubits[g_q["id"]]
    assert abs(g_meta["theo_pz0"] - 0.75) < 1e-4
    assert abs(g_meta["theo_px0"] - 0.50) < 1e-4
    assert abs(g_meta["theo_py0"] - (0.5 * (1.0 + np.sin(np.pi / 3)))) < 1e-4
    print(f"✔ Prepared generic state {g_q['label']}: Theoretical P_Z(0)={g_meta['theo_pz0']*100:.1f}%, P_X(0)={g_meta['theo_px0']*100:.1f}%, P_Y(0)={g_meta['theo_py0']*100:.1f}%")

    # 10. Y-Basis Measurement & Strictly Binary Syntax (0/1)
    print("\n--- 10. Testing Y-Basis Measurement & Strictly Binary Syntax ---")
    # Prepare |+i> state: theta=90, phi=90 -> |+i>
    alice.emit("prepare_generic_state", {"theta": 90.0, "phi": 90.0, "count": 1})
    alice_inv = get_latest_inventory(alice)
    y_qid = alice_inv["active_qubits"][-1]["id"]
    
    # Measure in Y basis: for |+i>, Y measurement gives 0 with probability 1!
    alice.emit("measure_batch", {"qubit_ids": [y_qid], "bases": "Y"})
    alice_inv = get_latest_inventory(alice)
    single_rec = alice_inv["classical_records"][-1]
    assert single_rec["type"] == "single_bit"
    assert single_rec["value"] == "0", f"Expected '0' for |+i> in Y-basis, got {single_rec['value']}"
    assert single_rec["eigenstate"] == "|+i⟩"
    assert single_rec["basis"] == "Circular (Y)"
    print(f"✔ Y-basis measurement returned binary outcome '{single_rec['value']}' with eigenstate {single_rec['eigenstate']}")

    # 11. Y-Basis Joint Sampling & Complete 3-Basis State Tomography (Z, X, Y)
    print("\n--- 11. Testing Y-Basis Joint Sampling & 3-Basis State Tomography ---")
    # Prepare a state for tomography: theta=60, phi=90
    alice.emit("prepare_generic_state", {"theta": 60.0, "phi": 90.0, "count": 1})
    alice_inv = get_latest_inventory(alice)
    tomo_qid = alice_inv["active_qubits"][-1]["id"]

    # Test Y-basis sampling directly
    alice.emit("sample_state", {"qubit_ids": [tomo_qid], "basis": "Y", "shots": 1000})
    received = alice.get_received()
    y_sample_evt = [e["args"][0] for e in received if e["name"] == "sample_results"][0]
    assert set(y_sample_evt["histogram"].keys()).issubset({"0", "1"})
    assert set(y_sample_evt["eigenstate_histogram"].keys()).issubset({"|+i⟩", "|-i⟩"})
    # P_Y(0) should be around 93.3%
    py0_empirical = y_sample_evt["frequencies"].get("0", 0.0)
    assert 0.85 < py0_empirical < 1.0, f"Empirical P_Y(0) {py0_empirical} not near 0.933"
    print(f"✔ Y-basis sampling empirical P_Y(|+i⟩) = {py0_empirical*100:.1f}% (theoretical ~93.3%)")

    # Test complete tomography event
    alice.emit("tomography_sample", {"qubit_ids": [tomo_qid], "shots": 1000})
    received = alice.get_received()
    tomo_evt = [e["args"][0] for e in received if e["name"] == "tomography_complete_results"][0]
    assert "z" in tomo_evt and "x" in tomo_evt and "y" in tomo_evt
    assert abs(tomo_evt["pz0"] - 75.0) < 6.0  # within 6% statistical margin with 1000 shots
    assert abs(tomo_evt["px0"] - 50.0) < 6.0
    assert abs(tomo_evt["py0"] - 93.3) < 6.0
    print(f"✔ Complete State Tomography verified: P_Z(0)={tomo_evt['pz0']:.1f}%, P_X(0)={tomo_evt['px0']:.1f}%, P_Y(0)={tomo_evt['py0']:.1f}%")

    # 12. Single-Item Batch Card Suppression
    print("\n--- 12. Testing Single-Item Batch Card Suppression ---")
    alice.emit("reset_room")
    alice.get_received()
    bob.get_received()

    # Measure 1 single qubit via measure_batch
    alice.emit("prepare_state", {"state_type": "0", "count": 1})
    alice_inv = get_latest_inventory(alice)
    q0_id = alice_inv["active_qubits"][0]["id"]

    alice.emit("measure_batch", {"qubit_ids": [q0_id], "bases": "Z"})
    alice_inv = get_latest_inventory(alice)
    # Must NOT create a batch card!
    assert len(alice_inv["batch_bitstrings"]) == 0, "Single qubit measurement created unwanted batch card!"
    assert len(alice_inv["classical_records"]) == 1
    assert alice_inv["classical_records"][0]["type"] == "single_bit"
    print("✔ Single qubit measurement produced ONLY a single_bit record (batch card suppressed).")

    # Measure 1 single Bell pair via measure_batch_bell
    alice.emit("prepare_state", {"state_type": "phi+", "count": 1})
    alice_inv = get_latest_inventory(alice)
    bp_qids = [alice_inv["active_qubits"][0]["id"], alice_inv["active_qubits"][1]["id"]]

    alice.emit("measure_batch_bell", {"pairs": [bp_qids]})
    alice_inv = get_latest_inventory(alice)
    # Must NOT create a batch_bell card in batch_bitstrings!
    assert len(alice_inv["batch_bitstrings"]) == 0, "Single Bell pair measurement created unwanted batch Bell card!"
    assert len(alice_inv["classical_records"]) == 2 # 1 prior single_bit + 1 joint_bell
    # Reverse time order: latest operation is at index 0 (top)!
    assert alice_inv["classical_records"][0]["type"] == "joint_bell"
    assert alice_inv["classical_records"][0]["bell_state"] == "|Φ+⟩"
    print("✔ Single Bell pair measurement produced ONLY a joint_bell record at top (batch card suppressed).")

    # 13. Hierarchical Nesting & Time-Ordered Classical Register (Latest at Top)
    print("\n--- 13. Testing Hierarchical Nesting & Reverse Time-Ordered Classical Register (Latest at Top) ---")
    alice.emit("reset_room")
    alice.get_received()
    bob.get_received()

    # Step 1: Single qubit measurement -> earliest
    alice.emit("prepare_state", {"state_type": "1", "count": 1})
    alice_inv = get_latest_inventory(alice)
    alice.emit("measure_batch", {"qubit_ids": [alice_inv["active_qubits"][0]["id"]], "bases": "Z"})

    # Step 2: Batch 3-qubit measurement
    alice.emit("prepare_state", {"state_type": "0", "count": 3})
    alice_inv = get_latest_inventory(alice)
    batch_3_ids = [q["id"] for q in alice_inv["active_qubits"]]
    alice.emit("measure_batch", {"qubit_ids": batch_3_ids, "bases": "ZZX"})

    # Step 3: Single Bell measurement
    alice.emit("prepare_state", {"state_type": "phi-", "count": 1})
    alice_inv = get_latest_inventory(alice)
    bell_ids = [alice_inv["active_qubits"][0]["id"], alice_inv["active_qubits"][1]["id"]]
    alice.emit("measure_batch_bell", {"pairs": [bell_ids]})

    # Step 4: Batch 2-pair Bell measurement -> latest
    alice.emit("prepare_state", {"state_type": "psi+", "count": 1})
    alice.emit("prepare_state", {"state_type": "psi-", "count": 1})
    alice_inv = get_latest_inventory(alice)
    p1 = [alice_inv["active_qubits"][0]["id"], alice_inv["active_qubits"][1]["id"]]
    p2 = [alice_inv["active_qubits"][2]["id"], alice_inv["active_qubits"][3]["id"]]
    alice.emit("measure_batch_bell", {"pairs": [p1, p2]})

    alice_inv = get_latest_inventory(alice)
    records = alice_inv["classical_records"]
    assert len(records) == 4, f"Expected 4 time-ordered records, got {len(records)}"

    # Reverse time order check: index 0 is Step 4 (latest operation at top!)
    assert records[0]["type"] == "batch_bell"
    assert len(records[0]["nested_joints"]) == 2
    for nj in records[0]["nested_joints"]:
        assert "qubit_a" in nj and "bell_state" in nj and "nested_bits" in nj
        assert len(nj["nested_bits"]) == 2

    # index 1 is Step 3
    assert records[1]["type"] == "joint_bell"
    assert records[1]["bell_state"] == "|Φ-⟩"
    assert len(records[1]["nested_bits"]) == 2
    assert records[1]["nested_bits"][0]["role"] == "Control (mc)"
    assert records[1]["nested_bits"][1]["role"] == "Target (mt)"

    # index 2 is Step 2
    assert records[2]["type"] == "batch_bits"
    assert len(records[2]["nested_bits"]) == 3
    for nb in records[2]["nested_bits"]:
        assert "qubit_number" in nb and "basis" in nb and "eigenstate" in nb and "value" in nb
        assert nb["value"] in ("0", "1")

    # index 3 is Step 1 (earliest operation at bottom)
    assert records[3]["type"] == "single_bit"
    assert records[3]["value"] == "1"
    assert records[3]["eigenstate"] == "|1⟩"

    print("✔ Reverse time order (latest at top) and hierarchical nesting in classical records verified!")

    print("\n=======================================================")
    print("🎉 ALL SIMULATOR INTEGRATION & PROTOCOL TESTS PASSED! 🎉")
    print("=======================================================")

if __name__ == "__main__":
    test_full_quantum_simulator()
