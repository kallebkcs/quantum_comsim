# ⚛ Real-Time Multiplayer Quantum Channel Simulator

A web-based, real-time multiplayer quantum communication sandbox powered by **Python (Flask-SocketIO)**, **Qiskit**, and **Vanilla JavaScript**.

Simulates real quantum communication protocols—including **Generic State Teleportation & State Tomography**, **Superdense Coding**, and **Automated Quantum Key Distribution (BB84)**—across multiple browser sessions.

---

## 🤖 Built with Artificial Intelligence

This project was developed with the assistance of **AntiGravity (version 2.15.1)**, generating functional implementation code from natural language prompts and requirements. 

All underlying system architecture, quantum computing logic, technical decisions, protocol rules, and iterative refinements required human supervision, domain knowledge, and careful curation.

---

## 🚀 Quickstart

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```
*(Dependencies: `flask`, `flask-socketio`, `simple-websocket`, `qiskit`, `numpy`)*

### 2. Start the Server
```bash
python server.py
```
The server starts on **`http://localhost:5000`**.

### 3. Open Two Connected Browser Sessions
- Open **Tab 1**: [http://localhost:5000/?user=Alice](http://localhost:5000/?user=Alice)
- Open **Tab 2**: [http://localhost:5000/?user=Bob](http://localhost:5000/?user=Bob)

---

## ✨ Features Added

### 1. Generic State Preparation & Teleportation
- **Interactive Angle Slider ($\theta \in [0^\circ, 180^\circ]$)**:
  - Formulates $|\psi\rangle = \alpha|0\rangle + \beta|1\rangle$ where $\alpha = \cos(\theta/2)$ and $\beta = \pm\sin(\theta/2)$.
  - Guaranteed to strictly satisfy the real probability rule: $|\alpha|^2 + |\beta|^2 = 1.000$.
  - Displays real-time probabilities $P(0)$ and $P(1)$ alongside the mathematical state equation.
  - Teleport this arbitrary superposition state to Bob using an EPR pair and classical corrections!

### 2. Quantum State Tomography (Sampling & Histogram)
- Any node possessing an unknown qubit $|ψ\rangle$ (e.g. Bob after teleportation) can click **`Sample 📊`**:
  - Simulates non-destructive quantum sampling ($1000$ shots) on the target state.
  - Displays a live **Histogram** comparing observed frequencies in Computational ($Z$) and Diagonal ($X$) bases.
  - Reconstructs estimated amplitudes: $|\hat{\psi}\rangle \approx \hat{\alpha}|0\rangle + \hat{\beta}|1\rangle$.
  - One-click **Share Reconstructed State in Chat** button to report tomography findings to the sender.

### 3. Automated Qubit Encoding Pipeline (BB84)
- **Bit Sequence + Basis Sequence $\implies$ Encoded Qubit Sequence**:
  - Enter bits (e.g. `0 1 1 0 1 0`) and bases (e.g. `Z X X Z X Z`).
  - Automatically prepares the corresponding quantum states:
    - `0` + `Z` $\implies |0\rangle$
    - `1` + `Z` $\implies |1\rangle$
    - `0` + `X` $\implies |+\rangle$
    - `1` + `X` $\implies |-\rangle$
  - Instantly allocates all qubits in your active inventory in sequential order.

### 4. Multi-Qubit Operations & Auto-Deselection
- Select multiple qubits with checkboxes or **Select All**.
- Click **Pauli-X**, **Pauli-Z**, or **Hadamard** to apply the gate to **all selected qubits simultaneously**.
- Upon applying a gate, the qubits are **automatically deselected**.
- Two-qubit gates (**CNOT**) continue to strictly adhere to the **Control-Target rule** using explicit role assignment buttons.

### 5. Multi-Qubit Transmission (Batch Send)
- Select multiple qubits in your inventory $\implies$ pick the recipient node $\implies$ click **Transmit Selected via Quantum Channel ✈**.
- All selected qubits are transmitted in a single atomic network event. The recipient receives all of them as `Unknown Qubit |ψ⟩`.

### 6. Multi-Qubit Measurement (Sequence Outcomes)
- Measure multiple selected qubits simultaneously:
  - Uniform basis (`All in Z` or `All in X`).
  - Or enter a custom basis sequence string (e.g. `Z X X Z X`).
- Returns the complete outcome sequence (e.g. `['1', '-', '-', '1', '-']`).
- **Strict Diagonal Basis Display**: Measurements in the Diagonal ($X$) basis display strictly as **`+`** or **`-`**.

### 7. Joint Bell Measurement & Encoded String Representation
- When measuring in the Bell basis, the Classical Register presents a unified **Joint Bell Outcome Card**:
  - Displays the collapsed Bell state ($|\Psi^+\rangle, |\Psi^-\rangle, |\Phi^+\rangle, |\Phi^-\rangle$).
  - Displays the corresponding encoded two-bit string ($00, 01, 10, 11$).
  - Displays both participating qubits in lecture order (e.g. Qubits #1 & #2) with individual control and target readings ($m_c, m_t$).
  - Interactive **EPR Reference Legend** in the local tools section.

### 8. Local Node Utilities (QKD Helpers)
- **Basis Comparison Tool**:
  - Compares two basis sequences (e.g. Alice's bases vs Bob's bases).
  - Calculates matching positions, percentage, and outputs the sifted key index array `[0, 2, 4, 5]`.
  - Includes visual side-by-side alignment table and copy/post to chat buttons.
- **Random Sequence Generator**:
  - Generates random bit sequences and random basis sequences of arbitrary length $N$.
  - One-click buttons to load directly into the **Batch Encoder** or **Multi-Measurement** inputs.

---

## 🧪 Testing

Run the automated integration test suite at any time:
```bash
python test_simulator.py
```
This tests Generic Teleportation with Tomography, Batch Encoding, Multi-Gate operations, Batch Transmission, Batch Measurements, and Joint Bell representations with 100% fidelity.
