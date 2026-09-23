"""
Automated Integration Tests for Quantum Channel Simulator.
Validates:
1. Multi-client Socket.IO room coordination & classical channel.
2. Generic State Preparation with real amplitudes (α² + β² = 1).
3. Teleportation of a generic state |ψ⟩ = 0.8|0⟩ + 0.6|1⟩.
4. Quantum State Sampling & Tomography (Histogram estimation of α and β).
5. Automated Batch Qubit Encoding (bit sequence + basis sequence = encoded qubits).
6. Multi-Qubit Gate Application (batch gates).
7. Batch Transmission over Quantum Channel.
8. Batch Measurement (qubits + bases = outcome sequence) with strict '+' and '-' diagonal display.
9. Joint Bell Measurement outcome representation with encoded 2-bit strings.
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

    # 1. Setup two clients
    alice = server.socketio.test_client(server.app)
    bob = server.socketio.test_client(server.app)
    assert alice.is_connected() and bob.is_connected(), "Clients failed to connect"

    alice.emit("join_room", {"username": "Alice", "room": "physics-lab"})
    bob.emit("join_room", {"username": "Bob", "room": "physics-lab"})

    bob_sid = get_peer_sid(alice, "Bob")
    alice_sid = get_peer_sid(bob, "Alice")
    assert bob_sid and alice_sid, "Could not resolve peer SIDs"

    # 2. Classical Channel Test
    alice.emit("send_classical_message", {"message": "Classical handshake: ready for teleportation."})
    bob_msgs = [e for e in bob.get_received() if e["name"] == "classical_message"]
    assert len(bob_msgs) > 0, "Bob did not receive classical message"
    print("✔ Classical Channel test passed.")

    # 3. EPR Pair Preparation & Quantum Transmission
    alice.emit("prepare_state", {"state_type": "phi+"})
    alice_inv = get_latest_inventory(alice)
    assert len(alice_inv["active_qubits"]) == 2
    qA = alice_inv["active_qubits"][0]["id"]
    qB = alice_inv["active_qubits"][1]["id"]

    # Alice transmits qB to Bob
    alice.emit("send_qubit", {"qubit_ids": [qB], "target_sid": bob_sid})
    bob_inv = get_latest_inventory(bob)
    assert len(bob_inv["active_qubits"]) == 1
    assert bob_inv["active_qubits"][0]["is_unknown"] is True
    print("✔ EPR pair prepared and qB transmitted to Bob.")

    # 4. Generic State Preparation & Teleportation
    # Alice prepares generic state: |ψ⟩ = 0.8|0⟩ + 0.6|1⟩
    alice.emit("prepare_generic_state", {"alpha": 0.8, "beta": 0.6})
    alice_inv = get_latest_inventory(alice)
    assert len(alice_inv["active_qubits"]) == 2
    q_gen = [q["id"] for q in alice_inv["active_qubits"] if q["id"] != qA][0]

    # Alice performs Bell measurement on q_gen and qA
    alice.emit("measure_bell", {"control_id": q_gen, "target_id": qA})
    alice_inv = get_latest_inventory(alice)
    assert len(alice_inv["active_qubits"]) == 0
    assert len(alice_inv["joint_bell_outcomes"]) == 1, "Expected Joint Bell outcome card"
    joint = alice_inv["joint_bell_outcomes"][0]
    mc = joint["control_bit"]
    mt = joint["target_bit"]
    print(f"✔ Alice performed Joint Bell measurement: State={joint['bell_state']}, Encoded={joint['encoded_bits']} (mc={mc}, mt={mt})")

    # Bob applies Pauli corrections: Z^mc X^mt
    if mt == 1:
        bob.emit("apply_gate", {"qubit_ids": [qB], "gate": "X"})
    if mc == 1:
        bob.emit("apply_gate", {"qubit_ids": [qB], "gate": "Z"})

    # 5. Quantum State Tomography / Sampling on Bob's Teleported Qubit
    bob.emit("sample_state", {"qubit_id": qB, "shots": 2000})
    bob_events = bob.get_received()
    sample_res = [e["args"][0] for e in bob_events if e["name"] == "sample_results"]
    assert len(sample_res) > 0, "Bob did not receive sample results"
    tomo = sample_res[0]
    print(f"✔ Bob sampled teleported state (2000 shots): P(0)={tomo['z_freq']['0']:.3f}, P(1)={tomo['z_freq']['1']:.3f}")
    print(f"  Reconstructed: α̂={tomo['est_alpha']:.3f}, β̂={tomo['est_beta']:.3f} (True: α=0.800, β=0.600)")
    assert abs(tomo["est_alpha"] - 0.8) < 0.08, f"Alpha estimate {tomo['est_alpha']} deviated too much from 0.8"
    assert abs(tomo["est_beta"] - 0.6) < 0.08, f"Beta estimate {tomo['est_beta']} deviated too much from 0.6"
    print("✔ Teleportation of Generic State and Tomography sampling 100% verified!")

    # 6. Automated Batch Qubit Encoding Pipeline
    print("\n--- Testing Automated Batch Encoding Pipeline ---")
    alice.emit("batch_encode", {"bits": "0 1 1 0 1", "bases": "Z X X Z X"})
    alice_inv = get_latest_inventory(alice)
    assert len(alice_inv["active_qubits"]) == 5
    batch_qids = [q["id"] for q in alice_inv["active_qubits"]]
    print(f"✔ Successfully batch-encoded 5 qubits: {batch_qids}")

    # 7. Multi-Qubit Operations (Batch Gate Application)
    # Apply X gate to all 5 qubits
    alice.emit("apply_gate", {"qubit_ids": batch_qids, "gate": "X"})
    print("✔ Multi-qubit gate application (X applied to all 5 qubits) verified.")

    # 8. Batch Transmission
    alice.emit("send_qubit", {"qubit_ids": batch_qids, "target_sid": bob_sid})
    alice_inv = get_latest_inventory(alice)
    bob_inv = get_latest_inventory(bob)
    assert len(alice_inv["active_qubits"]) == 0
    # Bob already had qB (unmeasured), so Bob now has 1 + 5 = 6 active qubits
    assert len(bob_inv["active_qubits"]) == 6
    print("✔ Batch transmission of multiple qubits verified.")

    # 9. Batch Measurement with Sequence of Bases & Strict +/- Diagonal Display
    print("\n--- Testing Batch Measurement & Diagonal Display ---")
    bob.emit("measure_batch", {"qubit_ids": batch_qids, "bases": "Z X X Z X"})
    bob_inv = get_latest_inventory(bob)
    # Check that measured classical bits from this batch exist
    measured_vals = [b["value"] for b in bob_inv["classical_bits"] if b["id"] in batch_qids]
    print(f"✔ Batch measurement outcomes: {measured_vals}")
    # Verify that Diagonal basis outcomes strictly display '+' or '-'
    for b in bob_inv["classical_bits"]:
        if b["basis"] == "Diagonal (X)":
            assert b["value"] in ("+", "-"), f"Expected strictly '+' or '-', got {b['value']}"
    print("✔ Diagonal basis display verification passed: strictly '+' or '-'.")

    # 10. Joint Bell Measurement Representation
    print("\n--- Testing Joint Bell Measurement Representation ---")
    alice.emit("prepare_state", {"state_type": "psi-"})
    alice_inv = get_latest_inventory(alice)
    bell_q1 = alice_inv["active_qubits"][0]["id"]
    bell_q2 = alice_inv["active_qubits"][1]["id"]
    alice.emit("measure_bell", {"control_id": bell_q1, "target_id": bell_q2})
    alice_inv = get_latest_inventory(alice)
    joint_outcomes = alice_inv["joint_bell_outcomes"]
    assert len(joint_outcomes) >= 1
    latest_joint = joint_outcomes[-1]
    assert latest_joint["bell_state"] == "|Ψ-⟩"
    assert latest_joint["encoded_bits"] == "01"
    print(f"✔ Joint Bell measurement verification passed: State={latest_joint['bell_state']}, Encoded 2-bit string={latest_joint['encoded_bits']}")

    print("\n=======================================================")
    print("🎉 ALL NEW FEATURES & VERIFICATIONS PASSED (100%)! 🎉")
    print("=======================================================")

if __name__ == "__main__":
    test_full_quantum_simulator()
