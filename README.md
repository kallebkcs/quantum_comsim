# ⚛ Real-Time Multiplayer Quantum Channel Simulator

A web-based, real-time multiplayer quantum communication simulator powered by **Python (Flask-SocketIO)**, **Qiskit**, and **Vanilla JavaScript**.

The simulator provides an interactive sandbox for multiple participants across independent browser sessions to construct, manipulate, transmit, and measure quantum subsystems across simulated quantum channels (particle transfer) and classical channels (classical telecommunications).

---

## 🌐 General Applications & Use Cases

Quantum ComSim was designed to bridge the gap between theoretical quantum information theory and practical, hands-on experimentation. The system is suited for a wide range of academic, pedagogical, and exploratory applications:

### 1. Higher Education & University Physics Courses
* **Interactive Classroom Laboratories**: Provides an accessible, zero-installation virtual quantum optics/information lab. Students in quantum mechanics, quantum computing, and computer science courses can pair up in real time to conduct collaborative experiments without requiring cryogenic physical hardware or queuing on cloud quantum computers.
* **Direct Visualization of Core Postulates**: Demonstrates fundamental quantum principles in action:
  * **State Superposition**: Arbitrary state preparation across the entire Bloch sphere using polar ($\theta$) and azimuthal ($\phi$) angles.
  * **Measurement Postulate & Wavefunction Collapse**: Projective collapse into basis eigenstates ($|0\rangle, |1\rangle$, $|+\rangle, |-\rangle$, $|+i\rangle, |-i\rangle$) with classical binary outcome registration.
  * **Non-Cloning Theorem**: Particles transmitted across the quantum channel arrive as unknown states ($|\psi\rangle$), preventing eavesdroppers or recipients from copying quantum information.
  * **Entanglement & Non-Locality**: Interactive preparation and correlation verification of two-qubit Bell pairs and $N$-qubit Greenberger-Horne-Zeilinger (GHZ) states.

### 2. Quantum Cryptography & Cybersecurity Training
* **Quantum Key Distribution (QKD) Demonstrations**: Hands-on execution of prepare-and-measure protocols (e.g. **BB84**, **B92**) and entanglement-based protocols (e.g. **E91 / Ekert**):
  * Automated generation of cryptographically secure random bit and basis sequences using the Web Cryptography API (CSPRNG).
  * Batch encoding, quantum channel transmission, and independent basis selection by the receiver.
  * Public basis sifting over the Classical Channel and distillation of secret keys via the integrated Sifted Key Extractor.
* **Eavesdropping Simulation & Error Analysis (QBER)**: Allows students to simulate a "Man-in-the-Middle" (Eve). Intercepting and measuring transmitted qubits in random bases introduces observable quantum bit error rates (QBER) on the sifted key, demonstrating how quantum mechanics naturally reveals eavesdroppers.
* **Quantum Secure Direct Communication (QSDC)**: Prototyping deterministic quantum direct communication protocols where secret messages are transmitted using pre-shared entanglement and decoy-state security checking.

### 3. Distributed Quantum Networks & Entanglement Routing
* **Entanglement Distribution Center (D.E.)**: Simulates network entanglement distribution servers (quantum repeaters or satellite nodes) that broadcast bipartite Bell pairs ($|\Phi^+\rangle$) or multipartite GHZ states ($|GHZ_N\rangle$) to multiple participants simultaneously.
* **Multipartite Quantum Protocols**:
  * **Quantum Secret Sharing (QSS)**: Distributing $N$-party GHZ states where no single party can reconstruct a classical secret without collaborating with all other participants.
  * **Quantum Byzantine Agreement & Consensus**: Utilizing non-local multipartite correlations to achieve distributed coordination in adversarial networks.
* **Quantum Teleportation & Superdense Coding**: Complete end-to-end execution of quantum teleportation (transferring arbitrary unknown quantum states via shared entanglement and two classical bits) and superdense coding (transmitting two classical bits of information using a single transmitted qubit).

### 4. Quantum State Characterization & Tomography
* **Complete 3-Basis Quantum State Tomography**: Reconstruct unknown quantum states experimentally by performing non-destructive sampling along three mutually unbiased bases ($Z$, $X$, and $Y$).
* **Statistical Verification & Shot Noise**: Compare theoretical expectation values ($\langle X \rangle, \langle Y \rangle, \langle Z \rangle$) and Born rule probabilities against empirical histograms across customizable shot counts ($500$ to $5,000$ shots).
* **Entanglement Verification**: Measure Bell and GHZ states across conjugate bases to verify violation of classical probability bounds and demonstrate genuine quantum non-locality.

### 5. Academic Seminars, Workshops & Interactive Demos
* **Low-Barrier Demonstration Tool**: Lightweight, responsive interface supporting both desktop and mobile browsers, allowing speakers to share a single room URL with a lecture hall or conference audience for live interactive participation.
* **Isolated Multi-Room Sessions**: Built-in room directory with private passkeys and participant limits allows multiple student lab groups to work in parallel rooms without cross-talk or interference.
* **Bilingual Support**: Fully localized in English and Portuguese to support diverse academic and educational environments.

---

## 🤖 Built with Artificial Intelligence

This project was developed with the assistance of **AntiGravity (version 2.15.1)**, generating functional implementation code from natural language specifications and architecture requirements. 

All underlying system architecture, quantum computing logic, technical decisions, protocol rules, and iterative refinements were guided by human supervision, domain knowledge, and rigorous scientific curation.

---

## 🏗️ System Architecture & Quantum Mechanics Engine

### 1. Quantum Cluster Subsystem Architecture (Memory Optimization)
In real-world quantum communication protocols (such as BB84 QKD with 32 or 64 bits), the vast majority of transmitted qubits exist in unentangled product states. Storing all room qubits in a single global statevector leads to an exponential Hilbert space explosion:
$$\dim(\mathcal{H}) = 2^N \quad (N = 32 \implies 2^{32} \times 16\text{ bytes} \approx 64\text{ GiB RAM})$$

To eliminate memory bottlenecks, the backend implements an **isolated quantum cluster architecture**:
- **Independent Subsystems**: When qubits are created independently (via single-qubit preparation or batch encoding), each resides in its own isolated cluster ($\dim = 2$).
- **Dynamic Cluster Merging**: When an entangling gate (such as CNOT) or a two-qubit Bell measurement is executed across distinct clusters, the engine dynamically merges the respective clusters via tensor product:
  $$\mathcal{H}_{\text{merged}} = \mathcal{H}_A \otimes \mathcal{H}_B$$
- **Projective Subspace Slicing**: When any qubit within an entangled cluster is measured in the computational or diagonal basis, the engine projectively collapses that subsystem, extracts the measured classical eigenvalue, slices out the measured dimension, and renormalizes the remaining statevector.
- **Safety Thresholds**: Enforces a strict ceiling on multi-qubit cluster merges ($N \le 16$) and active unmeasured qubit limits per participant ($N \le 64$) to guarantee consistent performance and prevent memory exhaustion on resource-constrained hosting environments.

### 2. Strict 0-Indexed Conventions
All qubits and selection indices are strictly **0-indexed**:
- Qubits are assigned visual and logical identifiers starting at `Qubit #0`, `Qubit #1`, `Qubit #2`...
- When multiple qubits are selected, their badges display their exact 0-indexed selection order: `0`, `1`, `2`...
- For multi-qubit gates (such as CNOT), the first selected qubit (`0`) is the **Control**, and all subsequent selections (`1..N`) act as **Targets**.

### 3. Operator Privacy & Separation of Channels
- **Private Quantum Feed**: Local quantum operations (state preparations, single-qubit gates, CNOT evolutions, non-destructive sampling, and measurements) are logged **only** to the operating node. Other participants cannot observe private state manipulation.
- **Quantum Channel (Particle Transfer)**: When qubits are transmitted to a peer, the recipient receives `Unknown Qubit |ψ⟩` (enforcing the quantum No-Cloning Theorem).
- **Classical Channel (Room Chat & Direct Messaging)**: Used for public announcement of measurement bases (sifting), classical correction bits in teleportation, and shared secret key validation.

---

## 🚀 Quickstart

### 1. Installation
Ensure Python 3.9+ is installed, then install dependencies:
```bash
pip install -r requirements.txt
```
*(Dependencies: `flask`, `flask-socketio`, `simple-websocket`, `gunicorn`, `qiskit`, `numpy`)*

### 2. Run the Development Server
```bash
python server.py
```
The server starts by default on `http://localhost:5000`.

### 3. Production Deployment (e.g. Render / Cloud)
The repository includes a ready-to-deploy [`Procfile`](Procfile) and [`render.yaml`](render.yaml) configured with Gunicorn and threaded WebSocket support:
```bash
gunicorn --worker-class gthread --threads 32 -w 1 -b 0.0.0.0:$PORT server:app
```
* Built-in `/health` and `/ping` endpoints allow uptime monitoring (e.g. via UptimeRobot) to manage container sleep cycles and ensure zero-delay responsiveness during live workshops.

---

## ⚛️ Supported Quantum Protocols & Workflows

### 1. Quantum Teleportation (Full Bloch Sphere & 3-Basis State Tomography)
Transmit an arbitrary quantum state $|\psi\rangle = \cos(\theta/2)|0\rangle + e^{i\phi}\sin(\theta/2)|1\rangle$ to a remote party using one shared EPR pair and two classical bits:
1. **Prepare Entanglement**: Alice prepares an EPR pair $|\Phi^+\rangle$ (Qubits #0 & #1) and transmits Qubit #1 to Bob via the Quantum Channel.
2. **Prepare Target State**: Alice configures a generic state $|\psi\rangle$ with polar angle $\theta$ and relative phase $\phi$ (e.g. $\theta = 60^\circ, \phi = 90^\circ \implies \frac{\sqrt{3}}{2}|0\rangle + \frac{i}{2}|1\rangle$) as Qubit #2. The builder displays theoretical probabilities ($P_Z(0) = 75.0\%, P_X(0) = 50.0\%, P_Y(0) = 93.3\%$).
3. **Bell Measurement**: Alice selects Qubit #2 (Control) and Qubit #0 (Target), then clicks **`Bell Basis Measurement`**.
4. **Classical Communication**: Alice sends her 2 measurement bits ($m_c, m_t$) to Bob in the Classical Channel.
5. **Unitary Correction**: Bob applies the corresponding Pauli correction ($I, X, Z,$ or $ZX$) to his received Qubit #1.
6. **State Tomography**: Bob selects Qubit #1 and runs **`Complete Tomography (Z, X, Y)`**. Comparing Bob's empirical probabilities with Alice's theoretical values experimentally confirms successful teleportation over the full Bloch sphere!

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
1. **Random Generation**: Alice uses the **Random Bit & Basis Generator** tool (powered by `window.crypto.getRandomValues`) to produce unbiased random bits and bases.
2. **Automated Encoding**: Alice encodes the sequence into individual qubits via the **Encoder** tool.
3. **Transmission**: Alice selects all encoded qubits and transmits them to Bob in a single batch.
4. **Bob's Measurement**: Bob generates a random basis sequence using the **Custom Basis Sequence** tool and executes batch measurement.
5. **Basis Sifting**: In the Classical Channel, Alice and Bob announce their measurement bases. Both input the sequences into the **Basis Comparison** tool to determine matching indices.
6. **Distillation**: Both enter the matching indices into the **Key Extractor** to extract the sifted secret key, automatically converting measurement outcomes into identical binary keys.

### 4. Multipartite Entanglement: N-Qubit GHZ States
Prepare and verify genuine $N$-qubit Greenberger-Horne-Zeilinger states:
$$|GHZ_N\rangle = \frac{|00\dots0\rangle + |11\dots1\rangle}{\sqrt{2}}$$
1. Set the number of qubits ($N \ge 3$) and click **`Prepare |GHZ_N⟩`** (or distribute across participants using the **Entanglement Distributor**).
2. Select all $N$ qubits and click **`Sample Z-Basis`**.
3. The joint histogram verifies perfect non-local correlation: only outcomes $|00\dots0\rangle$ ($50\%$) and $|11\dots1\rangle$ ($50\%$) appear.

---

## 🛠️ Tool Console & Reference Features

| Feature | Description |
| :--- | :--- |
| **Full Bloch Sphere State Builder** | Parametrize generic states via polar angle $\theta \in [0^\circ, 180^\circ]$ and phase angle $\phi \in [0^\circ, 360^\circ]$, featuring real-time calculation of theoretical probabilities ($P_Z, P_X, P_Y$) and complex state notation. |
| **Y-Basis Measurement & Tomography** | Rotate circular basis states ($|+i\rangle, |-i\rangle$) into computational basis via $H S^\dagger$ for single/batch measurement, non-destructive sampling, and full 3-basis quantum state reconstruction. |
| **Binary Outcome Syntax (`0` and `1`)** | All individual qubit measurement outcomes are strictly recorded as binary bits `0` and `1` (0 = positive eigenvector, 1 = negative eigenvector) with the collapsed eigenstate preserved in metadata. |
| **Hierarchical Nested Classical Register** | Measurement outcomes are reverse time-ordered (latest operations at the top). Single-item measurements produce clean individual cards; batch measurements nest individual bit/pair outcomes inside structured cards. |
| **Entangled Container Visuals & Selection** | Entangled subsystems (EPR pairs and GHZ states) are grouped in visual containers. Clicking the container badge selects all qubits in the entangled state at once. |
| **Non-Destructive Sampling & Tomography** | Sample joint states non-destructively in Z, X, or Y basis, or run complete 3-basis tomography with live frequency histograms and one-click chat sharing. |
| **Web Crypto CSPRNG** | Generates high-entropy, cryptographically secure random bits and bases using `window.crypto.getRandomValues()` directly in the client. |
| **Operation Event Log** | Private chronological log recording all local operations, gate transformations, measurements, and utility calculations (`Ut`). |
| **Room Directory & Security Gatekeeper** | Gartic-style room lobby with real-time room search, custom participant capacities, optional passkey protection, and duplicate handle prevention. |
| **Bilingual Internationalization (EN / PT)** | Full localization support across all labels, tools, tooltips, dialogs, and messages with a single toggle button. |

---

## 🧪 Automated Testing

Execute the comprehensive integration test suite:
```bash
python test_simulator.py
```

The test suite validates:
1. **Bell State Mapping**: $|\Phi^+\rangle \leftrightarrow 00$, $|\Phi^-\rangle \leftrightarrow 01$, $|\Psi^+\rangle \leftrightarrow 10$, $|\Psi^-\rangle \leftrightarrow 11$.
2. **0-Indexed Conventions**: Visual and logical identifiers starting at Qubit #0.
3. **Cluster Architecture**: 32-bit batch allocation without exponential memory growth.
4. **Gate Evolution**: Dynamic state label transformations ($|0\rangle \to |+\rangle \to |-\rangle \to |1\rangle$, unknown state prefixing).
5. **N-Qubit GHZ States**: Automatic generation, distribution, and joint sampling.
6. **Operator Privacy**: Alice's local quantum operations remain invisible in Bob's feed.
7. **Batch Bell Measurement**: Combined bitstring records for multi-pair Bell measurements.
8. **Sifted Key Extractor**: Correct distillation of sifted keys from raw tokens.
9. **Bloch Sphere Generic States**: Polar angle $\theta$ and relative phase $\phi$ state preparation with theoretical tomography probabilities.
10. **Y-Basis Measurement & Binary Syntax**: Circular basis measurement, strict `0` / `1` values, and collapsed eigenstate tracking.
11. **Y-Basis Sampling & 3-Basis State Tomography**: Non-destructive sampling and complete state reconstruction across Z, X, and Y.
12. **Single-Item Batch Suppression**: Eliminates redundant batch cards when measuring a single qubit or a single Bell pair.
13. **Hierarchical Nesting & Time Ordering**: Nested bits in batch measurements, nested $m_c/m_t$ in Bell measurements, and strict chronological ordering in the Classical Register.
14. **D.E. Entanglement Distributor & Room Security**: Multi-node Bell ($N=2$) and GHZ ($N \ge 3$) distribution, real-time room capacity, password validation, and duplicate handle protection.
