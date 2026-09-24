# ⚛ Real-Time Multiplayer Quantum Channel Simulator

A web-based, real-time multiplayer quantum communication simulator powered by **Python (Flask-SocketIO)**, **Qiskit**, and **Vanilla JavaScript**.

The simulator provides an interactive sandbox for multiple participants across independent browser sessions to construct, manipulate, transmit, and measure quantum subsystems across simulated quantum and classical channels.

---

## 🤖 Built with Artificial Intelligence

This project was developed with the assistance of **AntiGravity (version 2.15.1)**, generating functional implementation code from natural language prompts and requirements. 

All underlying system architecture, quantum computing logic, technical decisions, protocol rules, and iterative refinements required human supervision, domain knowledge, and careful curation.

---

## 🏗️ System Architecture & Quantum Mechanics Engine

### 1. Quantum Cluster Subsystem Architecture (Memory Optimization)
In real-world quantum communication protocols (such as BB84 QKD with 32 or 64 bits), the vast majority of transmitted qubits exist in unentangled product states. Storing all room qubits in a single global statevector leads to an exponential Hilbert space explosion:
$$\dim(\mathcal{H}) = 2^N \quad (N = 32 \implies 2^{32} \times 16\text{ bytes} \approx 64\text{ GiB RAM})$$

To eliminate memory bottlenecks, the backend implements an **isolated quantum cluster architecture**:
- **Independent Subsystems**: When qubits are created independently (e.g. via single-qubit preparation or batch encoding), each resides in its own isolated cluster ($\dim = 2$).
- **Dynamic Cluster Merging**: When an entangling gate (such as CNOT) or a two-qubit Bell measurement is executed across distinct clusters, the engine dynamically merges the respective clusters via tensor product:
  $$\mathcal{H}_{\text{merged}} = \mathcal{H}_A \otimes \mathcal{H}_B$$
- **Projective Subspace Slicing**: When any qubit within an entangled cluster is measured in the computational or diagonal basis, the engine projectively collapses that subsystem, extracts the measured classical eigenvalue, slices out the measured dimension, and renormalizes the remaining statevector.

### 2. 0-Indexed Conventions
All qubits and selection indices are strictly **0-indexed**:
- Qubits are assigned visual and logical identifiers starting at `Qubit #0`, `Qubit #1`, `Qubit #2`...
- When multiple qubits are selected, their badges display their exact 0-indexed selection order: `0`, `1`, `2`...
- For multi-qubit gates (such as CNOT), the first selected qubit (`0`) is the **Control**, and all subsequent selections (`1..N`) act as **Targets**.

### 3. Operator Privacy & Separation of Channels
- **Private Quantum Feed**: Local quantum operations (state preparations, single-qubit gates, CNOT evolutions, non-destructive sampling, and measurements) are logged **only** to the operating node (`to=sid`). Other participants cannot observe private state manipulation.
- **Quantum Channel (Particle Transfer)**: When qubits are transmitted to a peer, the recipient receives `Unknown Qubit |ψ⟩` (enforcing the quantum No-Cloning Theorem).
- **Classical Channel (Public Chat)**: Used for public announcement of measurement bases (sifting), classical correction bits in teleportation, and shared secret key validation.

---

## 🚀 Quickstart

### 1. Installation
Ensure Python 3.9+ is installed, then install dependencies:
```bash
pip install -r requirements.txt
```
*(Dependencies: `flask`, `flask-socketio`, `simple-websocket`, `qiskit`, `numpy`)*

### 2. Run the Server
```bash
python server.py
```
The server starts by default on `http://localhost:5000`.

### 3. Open Connected Multi-User Sessions
- **Alice**: [http://localhost:5000/?user=Alice](http://localhost:5000/?user=Alice)
- **Bob**: [http://localhost:5000/?user=Bob](http://localhost:5000/?user=Bob)

---

## ⚛️ Supported Quantum Protocols & Workflows

### 1. Quantum Teleportation (Full Bloch Sphere & 3-Basis State Tomography)
Transmit an arbitrary quantum state $|\psi\rangle = \cos(\theta/2)|0\rangle + e^{i\phi}\sin(\theta/2)|1\rangle$ to a remote party using one shared EPR pair and two classical bits:
1. **Prepare Entanglement**: Alice prepares an EPR pair $|\Phi^+\rangle$ (Qubits #0 & #1) and transmits Qubit #1 to Bob via the Quantum Channel.
2. **Prepare Target State**: Alice configures a generic state $|\psi\rangle$ with polar angle $\theta$ and relative phase $\phi$ (e.g. $\theta = 60^\circ, \phi = 90^\circ \implies \frac{\sqrt{3}}{2}|0\rangle + \frac{i}{2}|1\rangle$) as Qubit #2. The builder instantly displays theoretical probabilities ($P_Z(0) = 75.0\%, P_X(0) = 50.0\%, P_Y(0) = 93.3\%$) and the Bloch vector components ($\langle X \rangle, \langle Y \rangle, \langle Z \rangle$).
3. **Bell Measurement**: Alice selects Qubit #2 (Control) and Qubit #0 (Target), then clicks **`Bell Basis Measurement`**.
4. **Classical Communication**: Alice sends her 2 measurement bits ($m_c, m_t$) to Bob in the Classical Channel.
5. **Unitary Correction**: Bob applies the corresponding Pauli correction ($I, X, Z,$ or $ZX$) to his received Qubit #1.
6. **State Tomography**: Bob selects Qubit #1 and clicks **`Sample Z-Basis`**, or opens the dropdown to run **`Sample X-Basis`**, **`Sample Y-Basis`**, or **`Complete Tomography (Z, X, Y)`**. Comparing Bob's empirical probabilities with Alice's theoretical values experimentally confirms successful teleportation over the full Bloch sphere!

### 2. Superdense Coding (2 Classical Bits in 1 Transmitted Qubit)
1. **Shared Entanglement**: Alice prepares a Bell pair $|\Phi^+\rangle$ (Qubits #0 & #1) and sends Qubit #1 to Bob.
2. **Encoding**: Alice encodes a 2-bit message into her half (Qubit #0) by applying local gates:
   - `00` $\implies I$ (State remains $|\Phi^+\rangle$)
   - `01` $\implies Z$ (State becomes $|\Phi^-\rangle$)
   - `10` $\implies X$ (State becomes $|\Psi^+\rangle$)
   - `11` $\implies Y$ or $ZX$ (State becomes $|\Psi^-\rangle$)
3. **Transmission**: Alice sends Qubit #0 to Bob across the Quantum Channel.
4. **Decoding**: Bob selects Qubit #0 (Control) and Qubit #1 (Target) and clicks **`Bell Basis Measurement`**. Bob decodes the exact 2-bit string.

### 3. Quantum Key Distribution (BB84 Protocol)
Establish a shared cryptographic secret key between Alice and Bob with automated pipelines:
1. **Random Generation**: Alice uses the **Random Bit & Basis Generator** tool to generate random bits and bases.
2. **Automated Encoding**: Alice clicks **`Load to BB84 Encoder`** and clicks **`Encode Qubits`**.
3. **Transmission**: Alice selects all encoded qubits and transmits them to Bob in a single batch.
4. **Bob's Measurement**: Bob generates a random basis sequence, pastes it into **Custom Bases**, and clicks **`Measure with Sequence`**.
5. **Basis Sifting**: In the Classical Channel, Alice and Bob announce their basis sequences. Both paste the sequences into the **Basis Comparison Tool** to identify matching positions.
6. **Distillation**: Alice and Bob click **`Load to Key Extractor`**, paste their raw measurement results, and click **`Extract Secret Key`**. The tool automatically maps diagonal outcomes (`+` $\to 0$, `-` $\to 1$) and generates the identical sifted secret key!

### 4. Quantum Secure Direct Communication (QSDC)
Transmit secure messages directly using entangled pairs and checking for eavesdroppers:
1. Prepare an array of EPR pairs.
2. Send one qubit from each pair across the channel.
3. Check channel security using decoy states and basis comparison.
4. Encode the message on the remaining qubits using **`Apply Pauli String`** and measure in the Bell basis.

### 5. Multipartite Entanglement: N-Qubit GHZ States
Prepare and verify genuine $N$-qubit Greenberger-Horne-Zeilinger states:
$$|GHZ_N\rangle = \frac{|00\dots0\rangle + |11\dots1\rangle}{\sqrt{2}}$$
1. Set the number of qubits ($N \ge 3$) and click **`Prepare |GHZ_N⟩`**.
2. Select all $N$ qubits and click **`Sample Z-Basis`**.
3. The joint histogram verifies perfect non-local correlation: only outcomes $|00\dots0\rangle$ ($50\%$) and $|11\dots1\rangle$ ($50\%$) appear!

---

## 🛠️ Tool Console & Reference Features

| Feature | Description |
| :--- | :--- |
| **Full Bloch Sphere State Builder** | Parametrize generic states via polar angle $\theta \in [0^\circ, 180^\circ]$ and phase angle $\phi \in [0^\circ, 360^\circ]$, featuring real-time calculation of Bloch vectors and theoretical probabilities ($P_Z, P_X, P_Y$). |
| **Y-Basis Measurement & Tomography** | Rotate circular basis states ($|+i\rangle, |-i\rangle$) into computational basis via $H S^\dagger$ for single/batch measurement, non-destructive sampling, and full 3-basis quantum state reconstruction. |
| **Binary Outcome Syntax (`0` and `1`)** | All individual qubit measurement outcomes are strictly recorded as binary bits `0` and `1` (0 = positive eigenvector, 1 = negative eigenvector) with the collapsed eigenstate preserved in metadata. |
| **Hierarchical Nested Classical Register** | Measurement outcomes are reverse time-ordered (latest operations at the top). Single-item measurements produce clean individual cards (no redundant batch rectangle); batch measurements nest individual bit/pair outcomes inside collapsible detail drawers. |
| **Entangled Container Selection (EPR & GHZ)** | Entangled subsystems (EPR pairs and GHZ states) are grouped in visual containers. Clicking the container toggles selection of all qubits in the group, while clicking an individual qubit card toggles only that qubit. |
| **Dropdown Sampling Bases** | `Sample Z-Basis` is standard; clicking `▼` reveals `Sample X-Basis`, `Sample Y-Basis`, and `Complete Tomography (Z, X, Y)`, displaying probabilities and histograms labelled by their respective eigenstates ($|0\rangle, |1\rangle$, $|+\rangle, |-\rangle$, $|+i\rangle, |-i\rangle$). |
| **Unified Bell Measurement** | Automatically handles single pairs or batch pairs ($2, 4, 6\dots$ qubits) in a single click, recording nested $m_c$ and $m_t$ classical bits. |
| **Sifted Key Extractor** | Local node tool converting matching raw measurement tokens (`0, 1, +, -`) into distilled key bitstrings. |
| **Dynamic State Labels** | Applying gates updates the displayed state (e.g. $|0\rangle \xrightarrow{H} |+\rangle$; unknown states evolve as $H|\psi\rangle \to XH|\psi\rangle$). |
| **EPR Reference Helper** | Instant reference modal mapping Bell states to standard 2-bit representations and creation circuits. |

---

## 🧪 Automated Testing

Execute the end-to-end integration test suite:
```bash
python test_simulator.py
```

The test suite validates:
1. **Bell State Mapping**: $|\Phi^+\rangle \leftrightarrow 00$, $|\Phi^-\rangle \leftrightarrow 01$, $|\Psi^+\rangle \leftrightarrow 10$, $|\Psi^-\rangle \leftrightarrow 11$.
2. **0-Indexed Conventions**: Visual and logical identifiers starting at Qubit #0.
3. **Cluster Architecture**: 32-bit batch allocation without memory explosion.
4. **Gate Evolution**: Dynamic state label transformations ($|0\rangle \to |+\rangle \to |-\rangle \to |1\rangle$, unknown state prefixing).
5. **N-Qubit GHZ States**: Automatic generation and joint sampling.
6. **Operator Privacy**: Alice's local quantum operations remain invisible in Bob's feed.
7. **Batch Bell Measurement**: Combined bitstring records for multi-pair Bell measurements.
8. **Sifted Key Extractor**: Correct distillation of sifted keys from raw tokens.
9. **Bloch Sphere Generic States**: Polar angle $\theta$ and relative phase $\phi$ state preparation with theoretical tomography probabilities.
10. **Y-Basis Measurement & Binary Syntax**: Circular basis measurement, strict `0` / `1` values, and collapsed eigenstate tracking.
11. **Y-Basis Sampling & 3-Basis State Tomography**: Non-destructive sampling and complete state reconstruction across Z, X, and Y.
12. **Single-Item Batch Suppression**: Eliminates redundant batch cards when measuring a single qubit or a single Bell pair.
13. **Hierarchical Nesting & Time Ordering**: Nested bits in batch measurements, nested $m_c/m_t$ in Bell measurements, and strict chronological ordering in the Classical Register.
