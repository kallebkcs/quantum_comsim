/**
 * Quantum Channel Simulator - Frontend Application Logic
 * Supports:
 * - 0-indexed qubit counting (Qubit #0, #1, #2...) and 0-indexed selection badges (0, 1, 2...)
 * - Uniform selection styling (no Control vs Target color split)
 * - Clicking the EPR pair rectangle selects both qubits
 * - Dropdown toggle for X-basis, Y-basis, and Complete 3-Basis State Tomography
 * - Full Bloch sphere generic state preparation with polar angle θ and relative phase φ
 * - Time-ordered and hierarchically nested classical register outcomes
 * - Binary measurement outcomes (0 and 1) with collapsed eigenstate metadata
 * - Clean EPR preparation buttons with inline EPR Helper
 * - Automatic n-qubit GHZ state generation
 * - Unified Bell measurement button (handles single & batch pairs)
 * - Sifted Key Extractor tool (+ -> 0, - -> 1, 0 -> 0, 1 -> 1)
 * - Operator privacy for quantum feed
 */

document.addEventListener("DOMContentLoaded", () => {
  const socket = io();

  // Application State
  const state = {
    username: "Alice",
    room: "quantum-lab",
    mySid: null,
    peers: [],
    activeQubits: [],
    classicalRecords: [], // Unified, time-ordered, nested classical records
    selectedQubitIds: [], // Ordered array of qubit IDs (0-based selection)
    latestTomography: null,
  };

  // Check URL Query Parameters (?user=Bob&room=lab-1)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has("user")) {
    state.username = urlParams.get("user");
    document.getElementById("user-input").value = state.username;
  }
  if (urlParams.has("room")) {
    state.room = urlParams.get("room");
    document.getElementById("room-input").value = state.room;
  }

  // DOM Elements
  const toastContainer = document.getElementById("toast-container");
  const statusBadge = document.getElementById("connection-status");
  const roomInput = document.getElementById("room-input");
  const userInput = document.getElementById("user-input");
  const btnJoin = document.getElementById("btn-join");
  const btnResetRoom = document.getElementById("btn-reset-room");
  const peersList = document.getElementById("peers-list");
  const activeQubitsCount = document.getElementById("active-qubits-count");

  const qubitsContainer = document.getElementById("qubits-container");
  const classicalBitsContainer = document.getElementById("classical-bits-container");
  const btnSelectAll = document.getElementById("btn-select-all");
  const btnClearSelection = document.getElementById("btn-clear-selection");

  // Dynamic Sampling Console & Dropdown
  const samplingActionBox = document.getElementById("sampling-action-box");
  const btnSampleZ = document.getElementById("btn-sample-z");
  const btnToggleSampleMenu = document.getElementById("btn-toggle-sample-menu");
  const sampleBasisMenu = document.getElementById("sample-basis-menu");
  const btnSampleX = document.getElementById("btn-sample-x");
  const btnSampleY = document.getElementById("btn-sample-y");
  const btnSampleTomo = document.getElementById("btn-sample-tomo");
  const sampleShotsSelect = document.getElementById("sample-shots");

  // Preparation Elements
  const prepCountInput = document.getElementById("prep-count");
  const thetaSlider = document.getElementById("theta-slider");
  const thetaDisplay = document.getElementById("theta-display");
  const phiSlider = document.getElementById("phi-slider");
  const phiDisplay = document.getElementById("phi-display");
  const genericFormula = document.getElementById("generic-formula");
  const genericProbs = document.getElementById("generic-probs");
  const genericBloch = document.getElementById("generic-bloch");
  const btnPrepareGeneric = document.getElementById("btn-prepare-generic");

  // GHZ State Elements
  const ghzNInput = document.getElementById("ghz-n-input");
  const btnPrepareGhz = document.getElementById("btn-prepare-ghz");

  // EPR Helper Elements
  const btnEprHelperTop = document.getElementById("btn-epr-helper-top");
  const eprHelperModal = document.getElementById("epr-helper-modal");
  const btnCloseEprHelper = document.getElementById("btn-close-epr-helper");

  // Gate Buttons & Pauli String
  const btnGateX = document.getElementById("btn-gate-x");
  const btnGateZ = document.getElementById("btn-gate-z");
  const btnGateY = document.getElementById("btn-gate-y");
  const btnGateH = document.getElementById("btn-gate-h");
  const btnGateCNOT = document.getElementById("btn-gate-cnot");
  const pauliStringInput = document.getElementById("pauli-string-input");
  const btnApplyPauliString = document.getElementById("btn-apply-pauli-string");
  const errPauli = document.getElementById("err-pauli");

  // Transmission Elements
  const recipientSelect = document.getElementById("recipient-select");
  const btnSendQubit = document.getElementById("btn-send-qubit");

  // Measurement Elements
  const btnMeasureZ = document.getElementById("btn-measure-z");
  const btnMeasureX = document.getElementById("btn-measure-x");
  const btnMeasureY = document.getElementById("btn-measure-y");
  const btnMeasureBellUnified = document.getElementById("btn-measure-bell-unified");
  const batchMeasureBasesInput = document.getElementById("batch-measure-bases");
  const btnMeasureCustom = document.getElementById("btn-measure-custom");
  const errCustomMeasure = document.getElementById("err-custom-measure");
  const btnClearBits = document.getElementById("btn-clear-bits");

  // Pipelines
  const pipelineBitsInput = document.getElementById("pipeline-bits");
  const pipelineBasesInput = document.getElementById("pipeline-bases");
  const btnBatchEncode = document.getElementById("btn-batch-encode");
  const errPipeline = document.getElementById("err-pipeline");

  const eprBitsInput = document.getElementById("epr-bits-input");
  const btnBatchEncodeEpr = document.getElementById("btn-batch-encode-epr");
  const errEpr = document.getElementById("err-epr");

  // Local Tools
  const compBasesA = document.getElementById("comp-bases-a");
  const compBasesB = document.getElementById("comp-bases-b");
  const btnCompareBases = document.getElementById("btn-compare-bases");
  const errCompBases = document.getElementById("err-comp-bases");
  const compareResults = document.getElementById("compare-results");

  const siftedIndicesInput = document.getElementById("sifted-indices-input");
  const rawOutcomesInput = document.getElementById("raw-outcomes-input");
  const btnExtractKey = document.getElementById("btn-extract-key");
  const errSiftedExtract = document.getElementById("err-sifted-extract");
  const siftedKeyResults = document.getElementById("sifted-key-results");

  const randBitsCount = document.getElementById("rand-bits-count");
  const btnGenerateRandom = document.getElementById("btn-generate-random");
  const btnLoadEncoder = document.getElementById("btn-load-encoder");
  const btnLoadMeasure = document.getElementById("btn-load-measure");
  const randomResults = document.getElementById("random-results");

  // Tomography Panel
  const tomographyPanel = document.getElementById("tomography-panel");
  const tomographyDesc = document.getElementById("tomography-desc");
  const histogramContainer = document.getElementById("histogram-container");
  const btnCloseTomography = document.getElementById("btn-close-tomography");
  const btnShareHistogram = document.getElementById("btn-share-histogram");

  // Chat & Log Elements
  const chatMessages = document.getElementById("chat-messages");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");
  const btnClearChat = document.getElementById("btn-clear-chat");
  const quantumLogs = document.getElementById("quantum-logs");
  const btnClearLogs = document.getElementById("btn-clear-logs");

  let currentRandomBits = "";
  let currentRandomBases = "";
  let latestMatchingIndices = [];

  // ==========================================================================
  // Floating Toast Notifications (Always in viewport)
  // ==========================================================================
  function showToast(message, type = "error") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>⚠️ ${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = "slideInToast 0.2s reverse forwards";
      setTimeout(() => toast.remove(), 250);
    }, 4500);
  }

  function setInlineError(element, message) {
    if (!element) return;
    if (message) {
      element.textContent = `⚠️ ${message}`;
      element.style.display = "block";
    } else {
      element.textContent = "";
      element.style.display = "none";
    }
  }

  // ==========================================================================
  // Connection & Room Management
  // ==========================================================================
  function joinSession() {
    state.username = userInput.value.trim() || "Alice";
    state.room = roomInput.value.trim() || "quantum-lab";
    socket.emit("join_room", { username: state.username, room: state.room });
  }

  socket.on("connect", () => {
    state.mySid = socket.id;
    statusBadge.textContent = "Connected";
    statusBadge.className = "status-badge connected";
    joinSession();
  });

  socket.on("disconnect", () => {
    statusBadge.textContent = "Disconnected";
    statusBadge.className = "status-badge disconnected";
  });

  btnJoin.addEventListener("click", joinSession);

  btnResetRoom.addEventListener("click", () => {
    if (confirm("Reset all quantum registers and inventory for this room?")) {
      socket.emit("reset_room");
    }
  });

  btnClearChat.addEventListener("click", () => {
    chatMessages.innerHTML = "";
  });

  btnClearLogs.addEventListener("click", () => {
    quantumLogs.innerHTML = "";
  });

  // ==========================================================================
  // Socket Events
  // ==========================================================================
  socket.on("room_status", (data) => {
    state.peers = data.users || [];
    activeQubitsCount.textContent = data.active_qubits_count || 0;
    renderPeers();
    updateRecipientDropdown();
    updateControls();
  });

  socket.on("inventory_update", (data) => {
    state.activeQubits = data.active_qubits || [];
    state.classicalRecords = data.classical_records || [];

    // Filter out any selected IDs that no longer exist
    const activeIds = new Set(state.activeQubits.map((q) => q.id));
    state.selectedQubitIds = state.selectedQubitIds.filter((id) => activeIds.has(id));

    renderActiveQubits();
    renderClassicalRegister();
    updateControls();
  });

  socket.on("sample_results", (data) => {
    state.latestTomography = data;
    renderTomography(data);
  });

  socket.on("tomography_complete_results", (data) => {
    renderCompleteTomography(data);
  });

  socket.on("batch_measure_results", (data) => {
    showToast(`Measurement complete! Outcome: ${data.bitstring}`, "info");
  });

  socket.on("classical_message", (msg) => {
    appendChatMessage(msg);
  });

  socket.on("chat_history", (history) => {
    chatMessages.innerHTML = "";
    (history || []).forEach(appendChatMessage);
  });

  socket.on("quantum_event", (event) => {
    appendQuantumLog(event);
  });

  socket.on("quantum_logs_history", (history) => {
    quantumLogs.innerHTML = "";
    (history || []).forEach(appendQuantumLog);
  });

  socket.on("action_error", (data) => {
    showToast(data.message || "An error occurred.");
  });

  // ==========================================================================
  // Rendering Helpers
  // ==========================================================================
  function renderPeers() {
    peersList.innerHTML = "";
    if (state.peers.length === 0) {
      peersList.innerHTML = "<em>None</em>";
      return;
    }

    state.peers.forEach((peer) => {
      const isYou = peer.sid === state.mySid;
      const chip = document.createElement("span");
      chip.className = `peer-chip ${isYou ? "you" : ""}`;
      chip.textContent = isYou ? `${peer.username} (You)` : peer.username;
      peersList.appendChild(chip);
    });
  }

  function updateRecipientDropdown() {
    const currentVal = recipientSelect.value;
    recipientSelect.innerHTML = '<option value="">-- Select Recipient Node --</option>';

    const otherPeers = state.peers.filter((p) => p.sid !== state.mySid);
    otherPeers.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.sid;
      opt.textContent = `${p.username}`;
      if (opt.value === currentVal) opt.selected = true;
      recipientSelect.appendChild(opt);
    });

    recipientSelect.disabled = otherPeers.length === 0;
  }

  function createQubitCardElement(q) {
    const card = document.createElement("div");
    card.className = "qubit-card";
    card.dataset.id = q.id;

    const orderIdx = state.selectedQubitIds.indexOf(q.id); // 0-based
    const isSelected = orderIdx !== -1;

    if (isSelected) {
      card.classList.add("selected");
    }

    let orderBadgeHtml = "";
    if (isSelected) {
      orderBadgeHtml = `<span class="selection-order-badge">${orderIdx}</span>`;
    }

    card.innerHTML = `
      <div class="qubit-header">
        <span>Qubit #${q.number}</span>
        ${orderBadgeHtml}
      </div>
      <div class="qubit-state-label ${q.is_unknown ? 'unknown' : ''}">
        ${escapeHtml(q.label)}
      </div>
      <div class="qubit-meta">
        ${q.is_unknown ? '🔒 Amplitudes Hidden (No-Cloning)' : `Creator: ${escapeHtml(q.creator)}`}
      </div>
    `;

    card.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleQubitSelection(q.id);
    });

    return card;
  }

  function renderActiveQubits() {
    qubitsContainer.innerHTML = "";

    if (state.activeQubits.length === 0) {
      qubitsContainer.innerHTML = '<div class="empty-state">No qubits in your inventory. Prepare one below!</div>';
      return;
    }

    // Group pairs by pair_id if both qubits are currently held in user inventory
    const pairsMap = {};
    const processedQids = new Set();

    state.activeQubits.forEach((q) => {
      if (q.pair_id && q.pair_type) {
        if (!pairsMap[q.pair_id]) {
          pairsMap[q.pair_id] = [];
        }
        pairsMap[q.pair_id].push(q);
      }
    });

    state.activeQubits.forEach((q) => {
      if (processedQids.has(q.id)) return;

      const pairList = q.pair_id ? pairsMap[q.pair_id] : null;
      if (pairList && pairList.length >= 2) {
        // Render as joint entangled container (EPR pair or GHZ state)
        const isGHZ = q.pair_id && q.pair_id.startsWith("ghz_");
        const pairGroup = document.createElement("div");
        pairGroup.className = "epr-pair-group";

        const allSelected = pairList.every((p) => state.selectedQubitIds.includes(p.id));
        if (allSelected) {
          pairGroup.classList.add("all-selected");
          pairGroup.classList.add("both-selected");
        }

        const titleText = isGHZ
          ? `🔗 Entangled GHZ State (${escapeHtml(q.pair_type)})`
          : `🔗 Entangled EPR Pair (${escapeHtml(q.pair_type)})`;

        pairGroup.innerHTML = `
          <div class="epr-pair-header">
            <span>${titleText}</span>
          </div>
          <div class="epr-pair-qubits"></div>
        `;

        // Clicking the container toggles selection of all qubits in this entangled group
        pairGroup.addEventListener("click", () => {
          const isAllSel = pairList.every((p) => state.selectedQubitIds.includes(p.id));
          if (isAllSel) {
            // Deselect all in group
            const groupIds = new Set(pairList.map((p) => p.id));
            state.selectedQubitIds = state.selectedQubitIds.filter((id) => !groupIds.has(id));
          } else {
            // Select all in group (maintain order)
            pairList.forEach((p) => {
              if (!state.selectedQubitIds.includes(p.id)) {
                state.selectedQubitIds.push(p.id);
              }
            });
          }
          renderActiveQubits();
          updateControls();
        });

        const qubitsRow = pairGroup.querySelector(".epr-pair-qubits");
        pairList.forEach((p) => {
          qubitsRow.appendChild(createQubitCardElement(p));
          processedQids.add(p.id);
        });

        qubitsContainer.appendChild(pairGroup);
      } else {
        // Standalone qubit card
        qubitsContainer.appendChild(createQubitCardElement(q));
        processedQids.add(q.id);
      }
    });
  }

  // ==========================================================================
  // Classical Register Rendering (Time-Ordered & Nested Hierarchy)
  // ==========================================================================
  function renderClassicalRegister() {
    classicalBitsContainer.innerHTML = "";

    if (!state.classicalRecords || state.classicalRecords.length === 0) {
      classicalBitsContainer.innerHTML = '<div class="empty-state">No measured records yet.</div>';
      return;
    }

    // Render records in time-ordered sequence
    state.classicalRecords.forEach((r) => {
      if (r.type === "single_bit") {
        // 1. Single Bit Measurement
        const card = document.createElement("div");
        card.className = "bit-card";
        card.innerHTML = `
          <div class="bit-header">
            <span>Bit (Qubit #${r.qubit_number})</span>
            <span style="font-size:0.7rem; color:#94a3b8;">${r.timestamp}</span>
            <button class="btn btn-small" title="Share bit in chat" data-share-single="${r.id}">Share</button>
          </div>
          <div class="bit-value">${r.value}</div>
          <div class="bit-meta">
            Basis: <strong>${escapeHtml(r.basis)}</strong> | Collapsed: <strong>${escapeHtml(r.eigenstate || "")}</strong>
          </div>
        `;

        const shareBtn = card.querySelector(`[data-share-single="${r.id}"]`);
        shareBtn.addEventListener("click", () => {
          socket.emit("send_classical_message", {
            message: `[Classical Bit] Qubit #${r.qubit_number} in ${r.basis} ➔ Outcome: ${r.value} (State: ${r.eigenstate})`,
          });
        });

        classicalBitsContainer.appendChild(card);

      } else if (r.type === "batch_bits") {
        // 2. Batch Qubit Measurement with NESTED bit outcomes
        const card = document.createElement("div");
        card.className = "batch-bitstring-card";
        const qNums = (r.qubit_numbers || []).map((n) => `#${n}`).join(", ");
        const nestedList = r.nested_bits || [];

        let nestedHtml = "";
        if (nestedList.length > 0) {
          const pills = nestedList.map(b => `
            <div class="nested-bit-pill" title="Qubit #${b.qubit_number}: ${b.value} (${b.eigenstate}, ${b.basis})">
              <span>#${b.qubit_number}:</span>
              <span class="nested-bit-val">${b.value}</span>
              <span style="color:#64748b; font-size:0.68rem;">(${escapeHtml(b.eigenstate)})</span>
            </div>
          `).join("");

          nestedHtml = `
            <div class="nested-details">
              <button class="nested-toggle-btn" data-toggle-nested="${r.id}">▼ Individual Bit Outcomes (${nestedList.length})</button>
              <div class="nested-bits-grid" id="nested-grid-${r.id}">${pills}</div>
            </div>
          `;
        }

        card.innerHTML = `
          <div class="batch-bitstring-header">
            <span>📦 Batch Measurement Bitstring (${r.bitstring.length} bits)</span>
            <span style="font-size:0.7rem; color:#94a3b8;">${r.timestamp}</span>
            <button class="btn btn-small" title="Share bitstring in chat" data-share-batch="${r.id}">Share</button>
          </div>
          <div class="batch-bitstring-display">${escapeHtml(r.bitstring.split("").join(" "))}</div>
          <div class="batch-bitstring-meta">
            <div>• Qubits: ${qNums}</div>
            <div>• Bases: ${escapeHtml((r.bases || "").split("").join(" "))}</div>
          </div>
          ${nestedHtml}
        `;

        // Toggle collapsible nested details
        const toggleBtn = card.querySelector(`[data-toggle-nested="${r.id}"]`);
        if (toggleBtn) {
          toggleBtn.addEventListener("click", () => {
            const grid = card.querySelector(`#nested-grid-${r.id}`);
            const isClosed = grid.style.display === "none";
            grid.style.display = isClosed ? "flex" : "none";
            toggleBtn.textContent = isClosed
              ? `▼ Individual Bit Outcomes (${nestedList.length})`
              : `▶ Individual Bit Outcomes (${nestedList.length})`;
          });
        }

        const shareBtn = card.querySelector(`[data-share-batch="${r.id}"]`);
        shareBtn.addEventListener("click", () => {
          socket.emit("send_classical_message", {
            message: `[Batch Measurement Bitstring] Qubits [${qNums}] in bases [${r.bases}] ➔ Outcome: ${r.bitstring}`,
          });
        });

        classicalBitsContainer.appendChild(card);

      } else if (r.type === "joint_bell") {
        // 3. Single Joint Bell Outcome with NESTED control and target bits
        const card = document.createElement("div");
        card.className = "joint-bell-card";
        card.innerHTML = `
          <div class="joint-bell-header">
            <span>🔔 Joint Bell Outcome (Qubits #${r.qubit_a} & #${r.qubit_b})</span>
            <span style="font-size:0.7rem; color:#94a3b8;">${r.timestamp}</span>
            <button class="btn btn-small" title="Share result in chat" data-share-joint="${r.id}">Share</button>
          </div>
          <div class="joint-bell-body">
            <div class="bell-state-pill">${escapeHtml(r.bell_state)}</div>
            <div style="font-size:0.8rem; color:#64748b;">➔ Encoded 2-Bit:</div>
            <div class="encoded-bits-pill">${escapeHtml(r.encoded_bits)}</div>
          </div>
          <div class="joint-bell-meta nested-details">
            <div>• Lecture Order: Qubit #${r.qubit_a} & Qubit #${r.qubit_b}</div>
            <div>• Measured Bits: mc=<strong>${r.control_bit}</strong> (Qubit #${r.control_qubit}), mt=<strong>${r.target_bit}</strong> (Qubit #${r.target_qubit})</div>
          </div>
        `;

        const shareBtn = card.querySelector(`[data-share-joint="${r.id}"]`);
        shareBtn.addEventListener("click", () => {
          socket.emit("send_classical_message", {
            message: `[Joint Bell Result] Qubits #${r.qubit_a} & #${r.qubit_b} ➔ State: ${r.bell_state} | Encoded Bits: ${r.encoded_bits} (mc=${r.control_bit}, mt=${r.target_bit})`,
          });
        });

        classicalBitsContainer.appendChild(card);

      } else if (r.type === "batch_bell") {
        // 4. Batch Bell Measurement with NESTED Joint Bell Pairs
        const card = document.createElement("div");
        card.className = "batch-bell-card";
        const pairsStr = (r.pairs || []).join(", ");
        const nestedJoints = r.nested_joints || [];

        let nestedHtml = "";
        if (nestedJoints.length > 0) {
          const items = nestedJoints.map(j => `
            <div class="nested-joint-item">
              <span>Pair #${j.qubit_a}-#${j.qubit_b}: <strong>${escapeHtml(j.bell_state)}</strong> (Bits: <strong>${escapeHtml(j.encoded_bits)}</strong>)</span>
              <span style="color:#64748b; font-size:0.7rem;">mc=${j.control_bit}, mt=${j.target_bit}</span>
            </div>
          `).join("");

          nestedHtml = `
            <div class="nested-details">
              <button class="nested-toggle-btn" data-toggle-bell-nested="${r.id}">▼ Nested Joint Bell Outcomes (${nestedJoints.length})</button>
              <div class="nested-joints-list" id="nested-joints-${r.id}">${items}</div>
            </div>
          `;
        }

        card.innerHTML = `
          <div class="batch-bell-header">
            <span>🔔 Batch Bell Measurement (${r.pairs_count} Pairs / ${r.pairs_count * 2} Qubits)</span>
            <span style="font-size:0.7rem; color:#94a3b8;">${r.timestamp}</span>
            <button class="btn btn-small" title="Share bitstring in chat" data-share-bell-batch="${r.id}">Share</button>
          </div>
          <div class="batch-bell-display">${escapeHtml(r.bitstring)}</div>
          <div class="batch-bell-meta">
            <div>• Measured Bell States: <strong>${escapeHtml(r.bell_states || "")}</strong></div>
            <div>• Pairs: ${escapeHtml(pairsStr)}</div>
          </div>
          ${nestedHtml}
        `;

        const toggleBtn = card.querySelector(`[data-toggle-bell-nested="${r.id}"]`);
        if (toggleBtn) {
          toggleBtn.addEventListener("click", () => {
            const list = card.querySelector(`#nested-joints-${r.id}`);
            const isClosed = list.style.display === "none";
            list.style.display = isClosed ? "flex" : "none";
            toggleBtn.textContent = isClosed
              ? `▼ Nested Joint Bell Outcomes (${nestedJoints.length})`
              : `▶ Nested Joint Bell Outcomes (${nestedJoints.length})`;
          });
        }

        const shareBtn = card.querySelector(`[data-share-bell-batch="${r.id}"]`);
        shareBtn.addEventListener("click", () => {
          socket.emit("send_classical_message", {
            message: `[Batch Bell Measurement] ${r.pairs_count} pairs (${pairsStr}) ➔ Decoded Bitstring: [ ${r.bitstring} ] | States: ${r.bell_states}`,
          });
        });

        classicalBitsContainer.appendChild(card);
      }
    });
  }

  // ==========================================================================
  // Qubit Selection Logic (0-indexed order)
  // ==========================================================================
  function toggleQubitSelection(qid) {
    const idx = state.selectedQubitIds.indexOf(qid);
    if (idx !== -1) {
      state.selectedQubitIds.splice(idx, 1);
    } else {
      state.selectedQubitIds.push(qid);
    }
    renderActiveQubits();
    updateControls();
  }

  function clearSelection() {
    state.selectedQubitIds = [];
    renderActiveQubits();
    updateControls();
  }

  btnSelectAll.addEventListener("click", () => {
    state.selectedQubitIds = state.activeQubits.map((q) => q.id);
    renderActiveQubits();
    updateControls();
  });

  btnClearSelection.addEventListener("click", clearSelection);

  function updateControls() {
    const count = state.selectedQubitIds.length;

    // Show/hide sampling console (Appears ONLY when >= 1 qubit selected)
    samplingActionBox.style.display = count > 0 ? "block" : "none";

    // Single / Multi-Qubit Gates
    btnGateX.disabled = count === 0;
    btnGateZ.disabled = count === 0;
    btnGateY.disabled = count === 0;
    btnGateH.disabled = count === 0;
    btnGateX.textContent = count > 1 ? `Pauli-X (All ${count})` : "Pauli-X (NOT)";
    btnGateZ.textContent = count > 1 ? `Pauli-Z (All ${count})` : "Pauli-Z (Phase Flip)";
    btnGateY.textContent = count > 1 ? `Pauli-Y (All ${count})` : "Pauli-Y";
    btnGateH.textContent = count > 1 ? `Hadamard (All ${count})` : "Hadamard (H)";

    // CNOT (0 = Control, remaining 1..N = Targets, clean label without GHZ)
    btnGateCNOT.disabled = count < 2;
    btnGateCNOT.textContent = count > 2
      ? `CNOT (0 → 1..${count - 1})`
      : (count === 2 ? "CNOT (0 → 1)" : "CNOT (0 → 1..N)");

    // Pauli String Gate
    btnApplyPauliString.disabled = count === 0;
    btnApplyPauliString.textContent = count > 0
      ? `Apply Pauli String (${count} Qubits)`
      : "Apply Pauli String";

    // Transmission
    btnSendQubit.disabled = count === 0 || state.peers.length <= 1;
    btnSendQubit.textContent = count > 1
      ? `Transmit Selected (${count}) via Quantum Channel ✈`
      : "Transmit Selected via Quantum Channel ✈";

    // Measurements
    btnMeasureZ.disabled = count === 0;
    btnMeasureX.disabled = count === 0;
    btnMeasureY.disabled = count === 0;
    btnMeasureCustom.disabled = count === 0;

    btnMeasureZ.textContent = count > 1 ? `Measure All (${count}) in Z` : "Measure in Z [0/1]";
    btnMeasureX.textContent = count > 1 ? `Measure All (${count}) in X` : "Measure in X [0/1]";
    btnMeasureY.textContent = count > 1 ? `Measure All (${count}) in Y` : "Measure in Y [0/1]";

    // Unified Bell Measurement Button
    btnMeasureBellUnified.disabled = (count < 2 || count % 2 !== 0);
    if (count === 2) {
      btnMeasureBellUnified.textContent = "Bell Basis (1 Pair)";
    } else if (count > 2 && count % 2 === 0) {
      btnMeasureBellUnified.textContent = `Bell Basis (${count / 2} Pairs)`;
    } else {
      btnMeasureBellUnified.textContent = "Bell Basis Measurement";
    }
  }

  // ==========================================================================
  // Generic State (Full Bloch Sphere: θ and φ Relative Phase)
  // ==========================================================================
  function updateGenericState() {
    const thetaDeg = parseFloat(thetaSlider.value);
    const phiDeg = parseFloat(phiSlider.value);
    thetaDisplay.textContent = `${thetaDeg.toFixed(1)}°`;
    phiDisplay.textContent = `${phiDeg.toFixed(1)}°`;

    const thetaRad = (thetaDeg * Math.PI) / 180.0;
    const phiRad = (phiDeg * Math.PI) / 180.0;

    const alpha = Math.cos(thetaRad / 2.0);
    const sinHalf = Math.sin(thetaRad / 2.0);
    const betaReal = sinHalf * Math.cos(phiRad);
    const betaImag = sinHalf * Math.sin(phiRad);

    // Theoretical probabilities for state tomography:
    const pz0 = alpha * alpha;
    const px0 = 0.5 * (1.0 + Math.sin(thetaRad) * Math.cos(phiRad));
    const py0 = 0.5 * (1.0 + Math.sin(thetaRad) * Math.sin(phiRad));

    // Bloch vector components:
    const blochX = Math.sin(thetaRad) * Math.cos(phiRad);
    const blochY = Math.sin(thetaRad) * Math.sin(phiRad);
    const blochZ = Math.cos(thetaRad);

    const signImag = betaImag >= 0 ? "+" : "-";
    const phaseStr = `${alpha.toFixed(3)}|0⟩ + (${betaReal.toFixed(3)} ${signImag} ${Math.abs(betaImag).toFixed(3)}i)|1⟩`;
    genericFormula.textContent = `|ψ⟩ = ${phaseStr}`;

    genericProbs.textContent = `P_Z(0)=${(pz0 * 100).toFixed(1)}% | P_X(0)=${(px0 * 100).toFixed(1)}% | P_Y(0)=${(py0 * 100).toFixed(1)}%`;
    genericBloch.textContent = `Bloch Vector: ⟨X⟩=${blochX >= 0 ? "+" : ""}${blochX.toFixed(3)}, ⟨Y⟩=${blochY >= 0 ? "+" : ""}${blochY.toFixed(3)}, ⟨Z⟩=${blochZ >= 0 ? "+" : ""}${blochZ.toFixed(3)}`;
  }

  thetaSlider.addEventListener("input", updateGenericState);
  phiSlider.addEventListener("input", updateGenericState);

  btnPrepareGeneric.addEventListener("click", () => {
    const theta = parseFloat(thetaSlider.value);
    const phi = parseFloat(phiSlider.value);
    const count = parseInt(prepCountInput.value) || 1;

    socket.emit("prepare_generic_state", { theta, phi, count });
  });

  updateGenericState();

  // ==========================================================================
  // Quantum Action Triggers
  // ==========================================================================

  // 1. Basis & Bell State Preparation with Quantity
  document.querySelectorAll("[data-prep]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const stateType = btn.dataset.prep;
      const count = parseInt(prepCountInput.value) || 1;
      socket.emit("prepare_state", { state_type: stateType, count });
    });
  });

  // GHZ State Preparation
  btnPrepareGhz.addEventListener("click", () => {
    const n = parseInt(ghzNInput.value) || 3;
    socket.emit("prepare_ghz", { n });
  });

  // EPR Helper Toggle
  btnEprHelperTop.addEventListener("click", () => {
    const isHidden = eprHelperModal.style.display === "none";
    eprHelperModal.style.display = isHidden ? "block" : "none";
  });

  btnCloseEprHelper.addEventListener("click", () => {
    eprHelperModal.style.display = "none";
  });

  // 2. Quantum Gates (Apply, then AUTO-DESELECT)
  btnGateX.addEventListener("click", () => {
    if (state.selectedQubitIds.length > 0) {
      socket.emit("apply_gate", { qubit_ids: state.selectedQubitIds, gate: "X" });
      clearSelection();
    }
  });

  btnGateZ.addEventListener("click", () => {
    if (state.selectedQubitIds.length > 0) {
      socket.emit("apply_gate", { qubit_ids: state.selectedQubitIds, gate: "Z" });
      clearSelection();
    }
  });

  btnGateY.addEventListener("click", () => {
    if (state.selectedQubitIds.length > 0) {
      socket.emit("apply_gate", { qubit_ids: state.selectedQubitIds, gate: "Y" });
      clearSelection();
    }
  });

  btnGateH.addEventListener("click", () => {
    if (state.selectedQubitIds.length > 0) {
      socket.emit("apply_gate", { qubit_ids: state.selectedQubitIds, gate: "H" });
      clearSelection();
    }
  });

  // CNOT (0 = Control, remaining 1..N = Targets, auto-deselects)
  btnGateCNOT.addEventListener("click", () => {
    if (state.selectedQubitIds.length >= 2) {
      const controlId = state.selectedQubitIds[0];
      const targetIds = state.selectedQubitIds.slice(1);
      socket.emit("apply_cnot", { control_id: controlId, target_ids: targetIds });
      clearSelection();
    }
  });

  // Pauli String Application
  btnApplyPauliString.addEventListener("click", () => {
    const rawInput = pauliStringInput.value.trim().toUpperCase();
    const cleanOps = rawInput.replace(/[^XZYHI]/g, "");
    setInlineError(errPauli, "");

    if (state.selectedQubitIds.length === 0) {
      setInlineError(errPauli, "Select qubits first.");
      showToast("Select qubits first.");
      return;
    }

    if (cleanOps.length !== state.selectedQubitIds.length) {
      const msg = `Pauli string length (${cleanOps.length}) must match selected qubits count (${state.selectedQubitIds.length}).`;
      setInlineError(errPauli, msg);
      showToast(msg);
      return;
    }

    socket.emit("apply_pauli_string", {
      qubit_ids: state.selectedQubitIds,
      pauli_string: cleanOps,
    });
    pauliStringInput.value = "";
    clearSelection();
  });

  // 3. Batch Transmission
  btnSendQubit.addEventListener("click", () => {
    const targetSid = recipientSelect.value;
    if (!targetSid) {
      showToast("Please select a recipient node from the dropdown.");
      return;
    }
    if (state.selectedQubitIds.length === 0) {
      showToast("Please select at least one qubit to transmit.");
      return;
    }

    socket.emit("send_qubit", {
      qubit_ids: state.selectedQubitIds,
      target_sid: targetSid,
    });
    clearSelection();
  });

  // 4. Dynamic Sampling Console (Z, X, Y, and Complete Tomography)
  btnToggleSampleMenu.addEventListener("click", (e) => {
    e.stopPropagation();
    sampleBasisMenu.style.display = sampleBasisMenu.style.display === "none" ? "block" : "none";
  });

  document.addEventListener("click", () => {
    sampleBasisMenu.style.display = "none";
  });

  btnSampleZ.addEventListener("click", () => {
    if (state.selectedQubitIds.length > 0) {
      const shots = parseInt(sampleShotsSelect.value) || 1000;
      socket.emit("sample_state", {
        qubit_ids: state.selectedQubitIds,
        basis: "Z",
        shots,
      });
    }
  });

  btnSampleX.addEventListener("click", (e) => {
    e.stopPropagation();
    sampleBasisMenu.style.display = "none";
    if (state.selectedQubitIds.length > 0) {
      const shots = parseInt(sampleShotsSelect.value) || 1000;
      socket.emit("sample_state", {
        qubit_ids: state.selectedQubitIds,
        basis: "X",
        shots,
      });
    }
  });

  btnSampleY.addEventListener("click", (e) => {
    e.stopPropagation();
    sampleBasisMenu.style.display = "none";
    if (state.selectedQubitIds.length > 0) {
      const shots = parseInt(sampleShotsSelect.value) || 1000;
      socket.emit("sample_state", {
        qubit_ids: state.selectedQubitIds,
        basis: "Y",
        shots,
      });
    }
  });

  btnSampleTomo.addEventListener("click", (e) => {
    e.stopPropagation();
    sampleBasisMenu.style.display = "none";
    if (state.selectedQubitIds.length > 0) {
      const shots = parseInt(sampleShotsSelect.value) || 1000;
      socket.emit("tomography_sample", {
        qubit_ids: state.selectedQubitIds,
        shots,
      });
    }
  });

  // 5. Measurements (Batch Collapse in Z, X, Y)
  btnMeasureZ.addEventListener("click", () => {
    if (state.selectedQubitIds.length > 0) {
      socket.emit("measure_batch", {
        qubit_ids: state.selectedQubitIds,
        bases: "Z",
      });
      clearSelection();
    }
  });

  btnMeasureX.addEventListener("click", () => {
    if (state.selectedQubitIds.length > 0) {
      socket.emit("measure_batch", {
        qubit_ids: state.selectedQubitIds,
        bases: "X",
      });
      clearSelection();
    }
  });

  btnMeasureY.addEventListener("click", () => {
    if (state.selectedQubitIds.length > 0) {
      socket.emit("measure_batch", {
        qubit_ids: state.selectedQubitIds,
        bases: "Y",
      });
      clearSelection();
    }
  });

  btnMeasureCustom.addEventListener("click", () => {
    setInlineError(errCustomMeasure, "");
    const customBases = batchMeasureBasesInput.value.trim().toUpperCase().replace(/[^ZXY]/g, "");
    if (!customBases) {
      setInlineError(errCustomMeasure, "Please enter a basis sequence (e.g. 'ZXXZY').");
      showToast("Please enter a basis sequence.");
      return;
    }
    if (state.selectedQubitIds.length === 0) {
      setInlineError(errCustomMeasure, "No qubits selected for measurement.");
      showToast("No qubits selected for measurement.");
      return;
    }

    socket.emit("measure_batch", {
      qubit_ids: state.selectedQubitIds,
      bases: customBases,
    });
    clearSelection();
  });

  // Unified Bell Measurement (Pairs: 0-1, 2-3...)
  btnMeasureBellUnified.addEventListener("click", () => {
    const count = state.selectedQubitIds.length;
    if (count < 2 || count % 2 !== 0) {
      showToast("Bell measurement requires an even number of selected qubits.");
      return;
    }

    const pairs = [];
    for (let i = 0; i < count; i += 2) {
      pairs.push([state.selectedQubitIds[i], state.selectedQubitIds[i + 1]]);
    }

    socket.emit("measure_batch_bell", { pairs });
    clearSelection();
  });

  btnClearBits.addEventListener("click", () => {
    socket.emit("clear_measured");
  });

  // 6. Automated Pipelines
  btnBatchEncode.addEventListener("click", () => {
    setInlineError(errPipeline, "");
    const bits = pipelineBitsInput.value.trim();
    const bases = pipelineBasesInput.value.trim();
    if (!bits || !bases) {
      setInlineError(errPipeline, "Both Bit Sequence and Basis Sequence are required.");
      showToast("Both Bit Sequence and Basis Sequence are required.");
      return;
    }
    socket.emit("batch_encode", { bits, bases });
  });

  btnBatchEncodeEpr.addEventListener("click", () => {
    setInlineError(errEpr, "");
    const rawBits = eprBitsInput.value.trim().replace(/[^01]/g, "");
    if (!rawBits) {
      setInlineError(errEpr, "Please enter a bitstring for EPR encoding.");
      showToast("Please enter a bitstring for EPR encoding.");
      return;
    }
    if (rawBits.length % 2 !== 0) {
      const msg = `Bit sequence length (${rawBits.length}) must be even for EPR pair encoding.`;
      setInlineError(errEpr, msg);
      showToast(msg);
      return;
    }
    socket.emit("batch_encode_epr", { bits: rawBits });
  });

  // ==========================================================================
  // Local Node Tools
  // ==========================================================================
  btnCompareBases.addEventListener("click", () => {
    setInlineError(errCompBases, "");
    const aClean = compBasesA.value.toUpperCase().replace(/[^ZXY]/g, "");
    const bClean = compBasesB.value.toUpperCase().replace(/[^ZXY]/g, "");

    if (!aClean || !bClean) {
      setInlineError(errCompBases, "Please enter both basis sequences to compare.");
      showToast("Please enter both basis sequences to compare.");
      return;
    }

    const minLen = Math.min(aClean.length, bClean.length);
    const matchingIndices = [];
    let matchVisual = "";

    for (let i = 0; i < minLen; i++) {
      if (aClean[i] === bClean[i]) {
        matchingIndices.push(i);
        matchVisual += `<span style="color:#16a34a; font-weight:bold;">${aClean[i]}</span> `;
      } else {
        matchVisual += `<span style="color:#dc2626; font-weight:bold;">✗</span> `;
      }
    }

    latestMatchingIndices = matchingIndices;
    const percentage = ((matchingIndices.length / minLen) * 100).toFixed(1);
    compareResults.style.display = "block";
    compareResults.innerHTML = `
      <div style="font-weight:bold; margin-bottom:4px;">Basis Comparison Result:</div>
      <div>• Total positions compared: ${minLen}</div>
      <div>• Matching positions: <strong>${matchingIndices.length} / ${minLen} (${percentage}%)</strong></div>
      <div>• Sifted key indices: [ ${matchingIndices.join(", ")} ]</div>
      <div style="font-family:monospace; margin-top:6px; background:#f1f5f9; padding:4px 6px; border-radius:4px;">
        <div>Seq 1: ${aClean.slice(0, minLen).split("").join(" ")}</div>
        <div>Seq 2: ${bClean.slice(0, minLen).split("").join(" ")}</div>
        <div>Match: ${matchVisual}</div>
      </div>
      <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
        <button id="btn-copy-sifted" class="btn btn-small">Copy Sifted Indices</button>
        <button id="btn-load-sifted-to-extractor" class="btn btn-small">Load to Key Extractor</button>
        <button id="btn-post-sifted" class="btn btn-small">Post to Chat</button>
      </div>
    `;

    document.getElementById("btn-copy-sifted").onclick = () => {
      navigator.clipboard.writeText(matchingIndices.join(", "));
      showToast("Sifted indices copied to clipboard!", "info");
    };

    document.getElementById("btn-load-sifted-to-extractor").onclick = () => {
      siftedIndicesInput.value = matchingIndices.join(", ");
      siftedIndicesInput.scrollIntoView({ behavior: "smooth" });
      showToast("Loaded matching indices into Key Extractor!", "info");
    };

    document.getElementById("btn-post-sifted").onclick = () => {
      socket.emit("send_classical_message", {
        message: `[Basis Comparison] Sifted matching indices (${matchingIndices.length}/${minLen}): [ ${matchingIndices.join(", ")} ]`,
      });
    };
  });

  // Sifted Key Extractor Tool Logic (+ -> 0, - -> 1, 0 -> 0, 1 -> 1)
  btnExtractKey.addEventListener("click", () => {
    setInlineError(errSiftedExtract, "");
    const rawIndicesStr = siftedIndicesInput.value.trim();
    const rawOutcomesStr = rawOutcomesInput.value.trim();

    if (!rawIndicesStr || !rawOutcomesStr) {
      setInlineError(errSiftedExtract, "Both Sifted Indices and Raw Outcomes are required.");
      showToast("Both Sifted Indices and Raw Outcomes are required.");
      return;
    }

    const indices = (rawIndicesStr.match(/\d+/g) || []).map(Number);
    if (indices.length === 0) {
      setInlineError(errSiftedExtract, "No valid numeric indices found.");
      return;
    }

    // Extract outcome tokens (0, 1, +, -)
    const tokens = rawOutcomesStr.replace(/[^01\+\-]/g, "").split("");
    if (tokens.length === 0) {
      setInlineError(errSiftedExtract, "No valid measurement tokens (0, 1, +, -) found.");
      return;
    }

    const extractedBits = [];
    for (const idx of indices) {
      if (idx >= tokens.length) {
        setInlineError(errSiftedExtract, `Index ${idx} exceeds raw outcomes length (${tokens.length}).`);
        return;
      }
      const rawVal = tokens[idx];
      let bitVal = (rawVal === "0" || rawVal === "+") ? "0" : "1";
      extractedBits.push(bitVal);
    }

    const distilledKey = extractedBits.join("");
    siftedKeyResults.style.display = "block";
    siftedKeyResults.innerHTML = `
      <div style="font-weight:bold; margin-bottom:6px; color:#15803d;">🔑 Distilled Secret Key:</div>
      <div style="font-family:monospace; font-size:1.2rem; font-weight:800; background:#f0fdf4; border:1px solid #86efac; padding:6px 10px; border-radius:4px; text-align:center; letter-spacing:2px; color:#166534;">
        ${escapeHtml(distilledKey.split("").join(" "))}
      </div>
      <div style="font-size:0.75rem; color:#475569; margin-top:6px;">
        Length: <strong>${distilledKey.length} bits</strong> | Filtered ${indices.length} positions
      </div>
      <div style="margin-top:8px; display:flex; gap:6px;">
        <button id="btn-copy-distilled-key" class="btn btn-small">Copy Key</button>
        <button id="btn-share-distilled-key" class="btn btn-small">Share in Chat</button>
      </div>
    `;

    document.getElementById("btn-copy-distilled-key").onclick = () => {
      navigator.clipboard.writeText(distilledKey);
      showToast("Secret key copied to clipboard!", "info");
    };

    document.getElementById("btn-share-distilled-key").onclick = () => {
      socket.emit("send_classical_message", {
        message: `[Sifted Key Extractor] Distilled secret key (${distilledKey.length} bits): ${distilledKey}`,
      });
    };
  });

  btnGenerateRandom.addEventListener("click", () => {
    const n = Math.max(1, Math.min(64, parseInt(randBitsCount.value) || 8));
    let bits = "";
    let bases = "";
    for (let i = 0; i < n; i++) {
      bits += Math.random() < 0.5 ? "0" : "1";
      bases += Math.random() < 0.5 ? "Z" : "X";
    }

    currentRandomBits = bits.split("").join(" ");
    currentRandomBases = bases.split("").join(" ");

    randomResults.style.display = "block";
    randomResults.innerHTML = `
      <div style="font-family:monospace; margin-bottom:4px;">
        <div><strong>Random Bits (${n}):</strong> ${currentRandomBits}</div>
        <div><strong>Random Bases (${n}):</strong> ${currentRandomBases}</div>
      </div>
    `;

    btnLoadEncoder.style.display = "inline-block";
    btnLoadMeasure.style.display = "inline-block";
  });

  btnLoadEncoder.addEventListener("click", () => {
    pipelineBitsInput.value = currentRandomBits;
    pipelineBasesInput.value = currentRandomBases;
  });

  btnLoadMeasure.addEventListener("click", () => {
    batchMeasureBasesInput.value = currentRandomBases;
  });

  // ==========================================================================
  // Multi-Qubit Joint Sampling & Histogram Rendering (Respective Eigenstates)
  // ==========================================================================
  function formatEigenstateLabel(bitstr, basis) {
    const b = (basis || "Z").toUpperCase().trim();
    if (b === "Z") {
      return `|${bitstr}⟩`;
    } else if (b === "X") {
      const chars = bitstr.split("").map((ch) => (ch === "0" ? "+" : "-")).join("");
      return `|${chars}⟩`;
    } else if (b === "Y") {
      const parts = bitstr.split("").map((ch) => (ch === "0" ? "+i" : "-i"));
      if (parts.length === 1) return `|${parts[0]}⟩`;
      return `|${parts.join(", ")}⟩`;
    }
    return `|${bitstr}⟩`;
  }

  function renderTomography(data) {
    tomographyPanel.style.display = "block";
    const qNums = data.qubit_numbers.map((n) => `#${n}`).join(", ");
    const legend = data.eigenstates_legend ? ` [${data.eigenstates_legend}]` : "";
    tomographyDesc.textContent = `Joint Sampling Histogram on Qubits [${qNums}] in ${data.basis}-Basis (${data.shots} shots)${legend}:`;

    const keys = Object.keys(data.histogram);
    keys.sort();

    let barsHtml = "";
    keys.forEach((bitstr) => {
      const count = data.histogram[bitstr];
      const freq = ((count / data.shots) * 100).toFixed(1);
      const isAlt = data.basis === "X" || data.basis === "Y";
      const eigenLabel = formatEigenstateLabel(bitstr, data.basis);
      barsHtml += `
        <div class="hist-bar-group">
          <div class="hist-label-row">
            <span>${eigenLabel}: ${count} shots (${freq}%)</span>
          </div>
          <div class="hist-bar-track">
            <div class="hist-bar-fill ${isAlt ? 'alt' : ''}" style="width: ${Math.max(5, freq)}%;">${freq}%</div>
          </div>
        </div>
      `;
    });

    histogramContainer.innerHTML = barsHtml;
    tomographyPanel.scrollIntoView({ behavior: "smooth" });
  }

  function renderCompleteTomography(data) {
    tomographyPanel.style.display = "block";
    const qNums = data.qubit_numbers.map((n) => `#${n}`).join(", ");
    tomographyDesc.textContent = `🌐 Complete 3-Basis State Tomography on Qubits [${qNums}] (${data.z.shots} shots):`;

    const nQ = data.qubit_numbers.length;
    const z0 = formatEigenstateLabel("0".repeat(nQ), "Z");
    const z1 = formatEigenstateLabel("1".repeat(nQ), "Z");
    const x0 = formatEigenstateLabel("0".repeat(nQ), "X");
    const x1 = formatEigenstateLabel("1".repeat(nQ), "X");
    const y0 = formatEigenstateLabel("0".repeat(nQ), "Y");
    const y1 = formatEigenstateLabel("1".repeat(nQ), "Y");

    let html = `
      <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:10px; margin-bottom:12px;">
        <div style="font-weight:700; color:#1e293b; margin-bottom:4px;">Tomography Comparison Summary:</div>
        <div style="font-family:monospace; font-size:0.9rem;">
          <div>• Computational (Z-Basis): <strong>P(${z0}) = ${data.pz0.toFixed(1)}%</strong> | P(${z1}) = ${(100 - data.pz0).toFixed(1)}%</div>
          <div>• Diagonal (X-Basis):      <strong>P(${x0}) = ${data.px0.toFixed(1)}%</strong> | P(${x1}) = ${(100 - data.px0).toFixed(1)}%</div>
          <div>• Circular (Y-Basis):      <strong>P(${y0}) = ${data.py0.toFixed(1)}%</strong> | P(${y1}) = ${(100 - data.py0).toFixed(1)}%</div>
        </div>
      </div>
    `;

    // Render bars for all 3 bases
    ["z", "x", "y"].forEach((bKey) => {
      const bData = data[bKey];
      const bName = bKey.toUpperCase();
      html += `<div style="font-weight:700; font-size:0.8rem; margin:8px 0 4px; color:#475569;">${bName}-Basis Distribution:</div>`;
      const keys = Object.keys(bData.histogram);
      keys.sort();
      keys.forEach((bitstr) => {
        const count = bData.histogram[bitstr];
        const freq = ((count / bData.shots) * 100).toFixed(1);
        const eigenLabel = formatEigenstateLabel(bitstr, bName);
        html += `
          <div class="hist-bar-group">
            <div class="hist-label-row">
              <span>${eigenLabel}: ${count} shots (${freq}%)</span>
            </div>
            <div class="hist-bar-track">
              <div class="hist-bar-fill ${bKey === 'y' ? 'alt' : ''}" style="width: ${Math.max(5, freq)}%;">${freq}%</div>
            </div>
          </div>
        `;
      });
    });

    histogramContainer.innerHTML = html;
    tomographyPanel.scrollIntoView({ behavior: "smooth" });

    // Store for sharing
    state.latestTomography = {
      is_complete: true,
      qubit_numbers: data.qubit_numbers,
      summary: `P(${z0})=${data.pz0.toFixed(1)}%, P(${x0})=${data.px0.toFixed(1)}%, P(${y0})=${data.py0.toFixed(1)}%`,
    };
  }

  btnCloseTomography.addEventListener("click", () => {
    tomographyPanel.style.display = "none";
  });

  btnShareHistogram.addEventListener("click", () => {
    if (!state.latestTomography) return;
    const d = state.latestTomography;
    const qNums = d.qubit_numbers.map((n) => `#${n}`).join(", ");

    if (d.is_complete) {
      socket.emit("send_classical_message", {
        message: `[Complete State Tomography] Qubits [${qNums}] ➔ ${d.summary}`,
      });
    } else {
      const summary = Object.entries(d.histogram)
        .map(([k, c]) => `${formatEigenstateLabel(k, d.basis)}: ${c} (${((c / d.shots) * 100).toFixed(1)}%)`)
        .join(" | ");

      socket.emit("send_classical_message", {
        message: `[Sampling Histogram] Qubits [${qNums}] in ${d.basis}-Basis (${d.shots} shots) ➔ ${summary}`,
      });
    }
  });

  // ==========================================================================
  // Classical Channel (Chat)
  // ==========================================================================
  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;

    socket.emit("send_classical_message", { message: text });
    chatInput.value = "";
  });

  function appendChatMessage(msg) {
    const entry = document.createElement("div");
    const isMine = msg.sid === state.mySid || msg.sender === state.username;
    entry.className = `chat-entry ${isMine ? "mine" : ""}`;
    entry.innerHTML = `
      <span class="chat-time">${msg.timestamp || ""}</span>
      <span class="chat-sender">${msg.sender}:</span>
      <div class="chat-text">${escapeHtml(msg.message)}</div>
    `;
    chatMessages.appendChild(entry);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function appendQuantumLog(evt) {
    const entry = document.createElement("div");
    entry.className = `log-entry ${evt.type || ""}`;
    entry.innerHTML = `
      <span class="log-time">[${evt.timestamp || ""}]</span>
      <span class="log-message">${escapeHtml(evt.message)}</span>
    `;
    quantumLogs.prepend(entry);
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
});
