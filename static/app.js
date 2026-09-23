/**
 * Quantum Channel Simulator - Frontend Application Logic
 * Supports:
 * - Real-time Socket.IO multi-room communications
 * - Generic state preparation with slider (real-value probability rule α² + β² = 1)
 * - State tomography sampling & histogram visualization
 * - Automated batch qubit encoding (Bits + Bases = Qubits)
 * - Multi-qubit gate operations (with auto-deselection)
 * - Batch quantum transmissions & batch measurements
 * - Unified Joint Bell measurement representation
 * - Local node tools: Basis comparison & Random sequence generation
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
    classicalBits: [],
    jointBellOutcomes: [],
    selectedQubitIds: new Set(),
    controlQubitId: null,
    targetQubitId: null,
    betaSign: 1, // +1 or -1
    latestTomography: null,
  };

  // URL Query Parameters support (?user=Bob&room=lab-1)
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
  const statusBadge = document.getElementById("connection-status");
  const roomInput = document.getElementById("room-input");
  const userInput = document.getElementById("user-input");
  const btnJoin = document.getElementById("btn-join");
  const btnResetRoom = document.getElementById("btn-reset-room");
  const peersList = document.getElementById("peers-list");
  const activeQubitsCount = document.getElementById("active-qubits-count");
  const errorBanner = document.getElementById("error-banner");

  const qubitsContainer = document.getElementById("qubits-container");
  const classicalBitsContainer = document.getElementById("classical-bits-container");
  const selectionPill = document.getElementById("selection-pill");
  const btnSelectAll = document.getElementById("btn-select-all");
  const btnClearSelection = document.getElementById("btn-clear-selection");

  // Generic State Slider Elements
  const thetaSlider = document.getElementById("theta-slider");
  const thetaDisplay = document.getElementById("theta-display");
  const btnToggleSign = document.getElementById("btn-toggle-sign");
  const genericFormula = document.getElementById("generic-formula");
  const genericProbs = document.getElementById("generic-probs");
  const btnPrepareGeneric = document.getElementById("btn-prepare-generic");

  // Gate Buttons
  const btnGateX = document.getElementById("btn-gate-x");
  const btnGateZ = document.getElementById("btn-gate-z");
  const btnGateH = document.getElementById("btn-gate-h");
  const btnGateCNOT = document.getElementById("btn-gate-cnot");

  // Transmission Elements
  const recipientSelect = document.getElementById("recipient-select");
  const btnSendQubit = document.getElementById("btn-send-qubit");

  // Measurement Elements
  const btnMeasureZ = document.getElementById("btn-measure-z");
  const btnMeasureX = document.getElementById("btn-measure-x");
  const btnMeasureBell = document.getElementById("btn-measure-bell");
  const batchMeasureBasesInput = document.getElementById("batch-measure-bases");
  const btnMeasureCustom = document.getElementById("btn-measure-custom");
  const btnClearBits = document.getElementById("btn-clear-bits");

  // Automated Pipeline Elements
  const pipelineBitsInput = document.getElementById("pipeline-bits");
  const pipelineBasesInput = document.getElementById("pipeline-bases");
  const btnBatchEncode = document.getElementById("btn-batch-encode");

  // Local Node Tools Elements
  const compBasesA = document.getElementById("comp-bases-a");
  const compBasesB = document.getElementById("comp-bases-b");
  const btnCompareBases = document.getElementById("btn-compare-bases");
  const compareResults = document.getElementById("compare-results");

  const randBitsCount = document.getElementById("rand-bits-count");
  const btnGenerateRandom = document.getElementById("btn-generate-random");
  const btnLoadEncoder = document.getElementById("btn-load-encoder");
  const btnLoadMeasure = document.getElementById("btn-load-measure");
  const randomResults = document.getElementById("random-results");

  const btnToggleEprTable = document.getElementById("btn-toggle-epr-table");
  const eprReferenceTable = document.getElementById("epr-reference-table");

  // Tomography Panel Elements
  const tomographyPanel = document.getElementById("tomography-panel");
  const tomographyDesc = document.getElementById("tomography-desc");
  const histogramContainer = document.getElementById("histogram-container");
  const btnCloseTomography = document.getElementById("btn-close-tomography");
  const btnShareHistogram = document.getElementById("btn-share-histogram");

  // Chat & Log Elements
  const chatMessages = document.getElementById("chat-messages");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");
  const quantumLogs = document.getElementById("quantum-logs");

  let currentRandomBits = "";
  let currentRandomBases = "";

  // ==========================================================================
  // Socket.IO Connection & Room Management
  // ==========================================================================
  socket.on("connect", () => {
    state.mySid = socket.id;
    statusBadge.textContent = "Connected";
    statusBadge.className = "status-badge connected";
    joinCurrentRoom();
  });

  socket.on("disconnect", () => {
    statusBadge.textContent = "Disconnected";
    statusBadge.className = "status-badge disconnected";
  });

  function joinCurrentRoom() {
    state.username = userInput.value.trim() || "Anonymous";
    state.room = roomInput.value.trim() || "quantum-lab";
    socket.emit("join_room", {
      username: state.username,
      room: state.room,
    });
  }

  btnJoin.addEventListener("click", () => {
    clearSelection();
    joinCurrentRoom();
  });

  btnResetRoom.addEventListener("click", () => {
    if (confirm("Reset all quantum registers and qubits in this room?")) {
      socket.emit("reset_room");
      clearSelection();
    }
  });

  // ==========================================================================
  // Socket.IO Incoming Events
  // ==========================================================================
  socket.on("room_status", (data) => {
    state.peers = data.users || [];
    activeQubitsCount.textContent = data.active_qubits_count || 0;
    renderPeers();
    updateRecipientDropdown();
  });

  socket.on("inventory_update", (data) => {
    state.activeQubits = data.active_qubits || [];
    state.classicalBits = data.classical_bits || [];
    state.jointBellOutcomes = data.joint_bell_outcomes || [];

    // Filter out selections that no longer exist
    const activeIds = new Set(state.activeQubits.map((q) => q.id));
    state.selectedQubitIds = new Set(
      Array.from(state.selectedQubitIds).filter((id) => activeIds.has(id))
    );
    if (state.controlQubitId && !activeIds.has(state.controlQubitId)) {
      state.controlQubitId = null;
    }
    if (state.targetQubitId && !activeIds.has(state.targetQubitId)) {
      state.targetQubitId = null;
    }

    renderActiveQubits();
    renderClassicalRegister();
    updateControls();
  });

  socket.on("sample_results", (res) => {
    state.latestTomography = res;
    renderTomography(res);
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
    showError(data.message || "An error occurred.");
  });

  // ==========================================================================
  // UI Rendering & Notification Helpers
  // ==========================================================================
  function showError(msg) {
    errorBanner.textContent = `⚠️ ${msg}`;
    errorBanner.style.display = "block";
    setTimeout(() => {
      errorBanner.style.display = "none";
    }, 4500);
  }

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

  function renderActiveQubits() {
    qubitsContainer.innerHTML = "";

    if (state.activeQubits.length === 0) {
      qubitsContainer.innerHTML = '<div class="empty-state">No qubits in your inventory. Prepare one below!</div>';
      return;
    }

    state.activeQubits.forEach((q) => {
      const card = document.createElement("div");
      card.className = "qubit-card";
      card.dataset.id = q.id;

      const isSelected = state.selectedQubitIds.has(q.id);
      const isControl = state.controlQubitId === q.id;
      const isTarget = state.targetQubitId === q.id;

      if (isControl) card.classList.add("selected-control");
      else if (isTarget) card.classList.add("selected-target");
      else if (isSelected) card.classList.add("selected-multi");

      let roleBadgeHtml = "";
      if (isControl) {
        roleBadgeHtml = '<span class="role-badge control">Control</span>';
      } else if (isTarget) {
        roleBadgeHtml = '<span class="role-badge target">Target</span>';
      }

      card.innerHTML = `
        <div class="qubit-header">
          <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
            <input type="checkbox" class="card-checkbox" ${isSelected ? "checked" : ""}>
            <span>Qubit #${q.number}</span>
          </label>
          ${roleBadgeHtml}
        </div>
        <div class="qubit-state-label ${q.is_unknown ? 'unknown' : ''}">
          ${q.label}
        </div>
        <div class="qubit-meta">
          ${q.is_unknown ? '🔒 Amplitudes Hidden (No-Cloning)' : `Creator: ${q.creator}`}
        </div>
        <div class="card-actions-row">
          <button class="btn btn-small btn-set-ctrl" title="Set as Control qubit for CNOT/Bell">${isControl ? 'Unset C' : 'Set C'}</button>
          <button class="btn btn-small btn-set-tgt" title="Set as Target qubit for CNOT/Bell">${isTarget ? 'Unset T' : 'Set T'}</button>
          <button class="btn btn-small btn-sample" title="Execute Sampling / Tomography histogram">Sample 📊</button>
        </div>
      `;

      // Checkbox / Card selection toggle
      const checkbox = card.querySelector(".card-checkbox");
      checkbox.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleQubitSelection(q.id);
      });

      card.addEventListener("click", (e) => {
        if (e.target.tagName.toLowerCase() === "button" || e.target.tagName.toLowerCase() === "input") return;
        toggleQubitSelection(q.id);
      });

      // Role setting buttons
      const btnSetCtrl = card.querySelector(".btn-set-ctrl");
      btnSetCtrl.addEventListener("click", (e) => {
        e.stopPropagation();
        if (state.controlQubitId === q.id) {
          state.controlQubitId = null;
        } else {
          state.controlQubitId = q.id;
          state.selectedQubitIds.add(q.id);
          if (state.targetQubitId === q.id) state.targetQubitId = null;
        }
        renderActiveQubits();
        updateControls();
      });

      const btnSetTgt = card.querySelector(".btn-set-tgt");
      btnSetTgt.addEventListener("click", (e) => {
        e.stopPropagation();
        if (state.targetQubitId === q.id) {
          state.targetQubitId = null;
        } else {
          state.targetQubitId = q.id;
          state.selectedQubitIds.add(q.id);
          if (state.controlQubitId === q.id) state.controlQubitId = null;
        }
        renderActiveQubits();
        updateControls();
      });

      // Sampling button
      const btnSample = card.querySelector(".btn-sample");
      btnSample.addEventListener("click", (e) => {
        e.stopPropagation();
        socket.emit("sample_state", { qubit_id: q.id, shots: 1000 });
      });

      qubitsContainer.appendChild(card);
    });
  }

  function renderClassicalRegister() {
    classicalBitsContainer.innerHTML = "";

    const hasSingles = state.classicalBits.length > 0;
    const hasJoints = state.jointBellOutcomes.length > 0;

    if (!hasSingles && !hasJoints) {
      classicalBitsContainer.innerHTML = '<div class="empty-state">No measured bits yet.</div>';
      return;
    }

    // 1. Render Joint Bell Outcomes first (Unified representation)
    state.jointBellOutcomes.forEach((joint) => {
      const card = document.createElement("div");
      card.className = "joint-bell-card";
      card.innerHTML = `
        <div class="joint-bell-header">
          <span>🔔 Joint Bell Outcome (Qubits #${joint.qubit_a} & #${joint.qubit_b})</span>
          <button class="btn btn-small" title="Share result in Classical Channel" data-share-joint="${joint.id}">Share</button>
        </div>
        <div class="joint-bell-body">
          <div class="bell-state-pill">${joint.bell_state}</div>
          <div style="font-size:0.8rem; color:#64748b;">➔ Encoded Bits:</div>
          <div class="encoded-bits-pill">${joint.encoded_bits}</div>
        </div>
        <div class="joint-bell-meta">
          <div>• Lecture Order: Qubit #${joint.qubit_a} & Qubit #${joint.qubit_b}</div>
          <div>• Superdense Coding interpretation: <strong>${joint.dense_bits}</strong></div>
          <div>• Classical bits: mc=${joint.control_bit}, mt=${joint.target_bit}</div>
        </div>
      `;

      const shareBtn = card.querySelector(`[data-share-joint="${joint.id}"]`);
      shareBtn.addEventListener("click", () => {
        socket.emit("send_classical_message", {
          message: `[Classical Broadcast] Joint Bell Measurement on Qubits #${joint.qubit_a} & #${joint.qubit_b} ➔ State: ${joint.bell_state} | Encoded Bits: ${joint.encoded_bits} (Dense coding: ${joint.dense_bits})`,
        });
      });

      classicalBitsContainer.appendChild(card);
    });

    // 2. Render Single Collapsed Bits
    state.classicalBits.forEach((b) => {
      const card = document.createElement("div");
      card.className = "bit-card";
      card.innerHTML = `
        <div class="bit-header">
          <span>Bit (from Qubit #${b.number})</span>
          <button class="btn btn-small" title="Broadcast result to Classical Channel" data-share-id="${b.id}">Share</button>
        </div>
        <div class="bit-value">${b.value}</div>
        <div class="bit-meta">Basis: ${b.basis}</div>
      `;

      const shareBtn = card.querySelector(`[data-share-id="${b.id}"]`);
      shareBtn.addEventListener("click", () => {
        socket.emit("send_classical_message", {
          message: `[Classical Broadcast] Measurement of Qubit #${b.number} in ${b.basis} Basis ➔ Result: ${b.value}`,
        });
      });

      classicalBitsContainer.appendChild(card);
    });
  }

  // ==========================================================================
  // Qubit Selection Logic
  // ==========================================================================
  function toggleQubitSelection(qid) {
    if (state.selectedQubitIds.has(qid)) {
      state.selectedQubitIds.delete(qid);
      if (state.controlQubitId === qid) state.controlQubitId = null;
      if (state.targetQubitId === qid) state.targetQubitId = null;
    } else {
      state.selectedQubitIds.add(qid);
      // Auto-assign control / target if unset
      if (!state.controlQubitId) {
        state.controlQubitId = qid;
      } else if (!state.targetQubitId && state.controlQubitId !== qid) {
        state.targetQubitId = qid;
      }
    }
    renderActiveQubits();
    updateControls();
  }

  function clearSelection() {
    state.selectedQubitIds.clear();
    state.controlQubitId = null;
    state.targetQubitId = null;
    renderActiveQubits();
    updateControls();
  }

  btnSelectAll.addEventListener("click", () => {
    state.activeQubits.forEach((q) => state.selectedQubitIds.add(q.id));
    if (state.activeQubits.length >= 1 && !state.controlQubitId) {
      state.controlQubitId = state.activeQubits[0].id;
    }
    if (state.activeQubits.length >= 2 && !state.targetQubitId) {
      state.targetQubitId = state.activeQubits[1].id;
    }
    renderActiveQubits();
    updateControls();
  });

  btnClearSelection.addEventListener("click", clearSelection);

  function updateControls() {
    const count = state.selectedQubitIds.size;
    const hasControl = Boolean(state.controlQubitId);
    const hasTarget = Boolean(state.targetQubitId);
    const hasBothCNOT = hasControl && hasTarget && state.controlQubitId !== state.targetQubitId;

    // Update selection summary pill
    if (count === 0) {
      selectionPill.innerHTML = `<span>No qubits selected</span>`;
    } else {
      const selectedNums = Array.from(state.selectedQubitIds)
        .map((id) => `#${getQubitNumber(id)}`)
        .join(", ");
      let roleInfo = "";
      if (hasControl) roleInfo += ` | <strong>Control:</strong> Qubit #${getQubitNumber(state.controlQubitId)}`;
      if (hasTarget) roleInfo += ` | <strong>Target:</strong> Qubit #${getQubitNumber(state.targetQubitId)}`;
      selectionPill.innerHTML = `<span><strong>Selected (${count}):</strong> ${selectedNums}${roleInfo}</span>`;
    }

    // Single / Multi-Qubit Gates (apply to all selected)
    btnGateX.disabled = count === 0;
    btnGateZ.disabled = count === 0;
    btnGateH.disabled = count === 0;
    btnGateX.textContent = count > 1 ? `Pauli-X (All ${count})` : "Pauli-X (NOT)";
    btnGateZ.textContent = count > 1 ? `Pauli-Z (All ${count})` : "Pauli-Z (Phase Flip)";
    btnGateH.textContent = count > 1 ? `Hadamard (All ${count})` : "Hadamard (H)";

    // CNOT strictly follows Control-Target rule
    btnGateCNOT.disabled = !hasBothCNOT;

    // Transmission: batch or single
    btnSendQubit.disabled = count === 0 || state.peers.length <= 1;
    btnSendQubit.textContent = count > 1
      ? `Transmit Selected (${count}) via Quantum Channel ✈`
      : "Transmit Selected via Quantum Channel ✈";

    // Measurement
    btnMeasureZ.disabled = count === 0;
    btnMeasureX.disabled = count === 0;
    btnMeasureCustom.disabled = count === 0;
    btnMeasureBell.disabled = !hasBothCNOT;

    btnMeasureZ.textContent = count > 1 ? `Measure All (${count}) in Z [0/1]` : "Measure in Z [0/1]";
    btnMeasureX.textContent = count > 1 ? `Measure All (${count}) in X [+/-]` : "Measure in X [+/-]";
  }

  function getQubitNumber(qid) {
    const found = state.activeQubits.find((q) => q.id === qid);
    return found ? found.number : qid;
  }

  // ==========================================================================
  // Generic State Slider Calculations
  // ==========================================================================
  function updateGenericState() {
    const thetaDeg = parseFloat(thetaSlider.value);
    thetaDisplay.textContent = `${thetaDeg.toFixed(1)}°`;

    // Angle theta in radians
    const thetaRad = (thetaDeg * Math.PI) / 180.0;
    const alpha = Math.cos(thetaRad / 2.0);
    const beta = state.betaSign * Math.sin(thetaRad / 2.0);

    const p0 = alpha * alpha;
    const p1 = beta * beta;

    const signChar = beta >= 0 ? "+" : "-";
    genericFormula.textContent = `|ψ⟩ = ${alpha.toFixed(3)}|0⟩ ${signChar} ${Math.abs(beta).toFixed(3)}|1⟩`;
    genericProbs.textContent = `P(0) = ${(p0 * 100).toFixed(1)}% | P(1) = ${(p1 * 100).toFixed(1)}%`;
  }

  thetaSlider.addEventListener("input", updateGenericState);

  btnToggleSign.addEventListener("click", () => {
    state.betaSign = -state.betaSign;
    btnToggleSign.textContent = `β Sign: (${state.betaSign > 0 ? "+" : "-"})`;
    updateGenericState();
  });

  btnPrepareGeneric.addEventListener("click", () => {
    const thetaDeg = parseFloat(thetaSlider.value);
    const thetaRad = (thetaDeg * Math.PI) / 180.0;
    const alpha = Math.cos(thetaRad / 2.0);
    const beta = state.betaSign * Math.sin(thetaRad / 2.0);

    socket.emit("prepare_generic_state", { alpha, beta });
  });

  updateGenericState(); // Initial calculation

  // ==========================================================================
  // Quantum Action Triggers
  // ==========================================================================

  // 1. Basis & Bell State Preparation
  document.querySelectorAll("[data-prep]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const stateType = btn.dataset.prep;
      socket.emit("prepare_state", { state_type: stateType });
    });
  });

  // 2. Quantum Gates (Apply to all selected qubits, then DESELECT)
  btnGateX.addEventListener("click", () => {
    if (state.selectedQubitIds.size > 0) {
      socket.emit("apply_gate", {
        qubit_ids: Array.from(state.selectedQubitIds),
        gate: "X",
      });
      clearSelection(); // Requirement: When gate is applied, deselect
    }
  });

  btnGateZ.addEventListener("click", () => {
    if (state.selectedQubitIds.size > 0) {
      socket.emit("apply_gate", {
        qubit_ids: Array.from(state.selectedQubitIds),
        gate: "Z",
      });
      clearSelection(); // Requirement: When gate is applied, deselect
    }
  });

  btnGateH.addEventListener("click", () => {
    if (state.selectedQubitIds.size > 0) {
      socket.emit("apply_gate", {
        qubit_ids: Array.from(state.selectedQubitIds),
        gate: "H",
      });
      clearSelection(); // Requirement: When gate is applied, deselect
    }
  });

  // CNOT (follows Control-Target rule, then DESELECTS)
  btnGateCNOT.addEventListener("click", () => {
    if (state.controlQubitId && state.targetQubitId) {
      socket.emit("apply_cnot", {
        control_id: state.controlQubitId,
        target_id: state.targetQubitId,
      });
      clearSelection(); // Requirement: When gate is applied, deselect
    }
  });

  // 3. Batch Transmission
  btnSendQubit.addEventListener("click", () => {
    const targetSid = recipientSelect.value;
    if (!targetSid) {
      showError("Please select a recipient node from the dropdown.");
      return;
    }
    if (state.selectedQubitIds.size === 0) {
      showError("Please select at least one qubit to transmit.");
      return;
    }

    socket.emit("send_qubit", {
      qubit_ids: Array.from(state.selectedQubitIds),
      target_sid: targetSid,
    });

    clearSelection();
  });

  // 4. Measurements
  btnMeasureZ.addEventListener("click", () => {
    if (state.selectedQubitIds.size > 0) {
      socket.emit("measure_batch", {
        qubit_ids: Array.from(state.selectedQubitIds),
        bases: "Z",
      });
      clearSelection();
    }
  });

  btnMeasureX.addEventListener("click", () => {
    if (state.selectedQubitIds.size > 0) {
      socket.emit("measure_batch", {
        qubit_ids: Array.from(state.selectedQubitIds),
        bases: "X",
      });
      clearSelection();
    }
  });

  btnMeasureCustom.addEventListener("click", () => {
    const customBases = batchMeasureBasesInput.value.trim();
    if (!customBases) {
      showError("Please enter a basis sequence (e.g. 'Z X X Z X').");
      return;
    }
    if (state.selectedQubitIds.size === 0) {
      showError("No qubits selected for measurement.");
      return;
    }

    socket.emit("measure_batch", {
      qubit_ids: Array.from(state.selectedQubitIds),
      bases: customBases,
    });
    clearSelection();
  });

  btnMeasureBell.addEventListener("click", () => {
    if (state.controlQubitId && state.targetQubitId) {
      socket.emit("measure_bell", {
        control_id: state.controlQubitId,
        target_id: state.targetQubitId,
      });
      clearSelection();
    }
  });

  btnClearBits.addEventListener("click", () => {
    socket.emit("clear_measured");
  });

  // 5. Automated Pipeline Encoding
  btnBatchEncode.addEventListener("click", () => {
    const bits = pipelineBitsInput.value.trim();
    const bases = pipelineBasesInput.value.trim();
    if (!bits || !bases) {
      showError("Both Bit Sequence and Basis Sequence are required for encoding.");
      return;
    }
    socket.emit("batch_encode", { bits, bases });
  });

  // ==========================================================================
  // Local Node Tools (QKD Helpers)
  // ==========================================================================

  // Basis Comparison Tool
  btnCompareBases.addEventListener("click", () => {
    const aClean = compBasesA.value.toUpperCase().replace(/[^ZX]/g, "");
    const bClean = compBasesB.value.toUpperCase().replace(/[^ZX]/g, "");

    if (!aClean || !bClean) {
      showError("Please enter both basis sequences to compare.");
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

    const percentage = ((matchingIndices.length / minLen) * 100).toFixed(1);
    compareResults.style.display = "block";
    compareResults.innerHTML = `
      <div style="font-weight:bold; margin-bottom:4px;">Comparison Result:</div>
      <div>• Total positions compared: ${minLen}</div>
      <div>• Matching positions: <strong>${matchingIndices.length} / ${minLen} (${percentage}%)</strong></div>
      <div>• Sifted key indices: [ ${matchingIndices.join(", ")} ]</div>
      <div style="font-family:monospace; margin-top:6px; background:#f1f5f9; padding:4px 6px; border-radius:4px;">
        <div>Seq 1: ${aClean.slice(0, minLen).split("").join(" ")}</div>
        <div>Seq 2: ${bClean.slice(0, minLen).split("").join(" ")}</div>
        <div>Match: ${matchVisual}</div>
      </div>
      <div style="margin-top:8px;">
        <button id="btn-copy-sifted" class="btn btn-small">Copy Sifted Indices</button>
        <button id="btn-post-sifted" class="btn btn-small">Post to Chat</button>
      </div>
    `;

    document.getElementById("btn-copy-sifted").onclick = () => {
      navigator.clipboard.writeText(matchingIndices.join(", "));
      showError("Sifted indices copied to clipboard!");
    };

    document.getElementById("btn-post-sifted").onclick = () => {
      socket.emit("send_classical_message", {
        message: `[Basis Comparison] Sifted matching indices (${matchingIndices.length}/${minLen}): [ ${matchingIndices.join(", ")} ]`,
      });
    };
  });

  // Random Sequence Generator
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

  // EPR Reference Table Toggle
  btnToggleEprTable.addEventListener("click", () => {
    const isHidden = eprReferenceTable.style.display === "none";
    eprReferenceTable.style.display = isHidden ? "block" : "none";
    btnToggleEprTable.querySelector("h4").textContent = isHidden
      ? "📖 EPR State ↔ Two-Bit String Reference Legend ▲"
      : "📖 EPR State ↔ Two-Bit String Reference Legend ▼";
  });

  // ==========================================================================
  // Quantum State Tomography (Histogram)
  // ==========================================================================
  function renderTomography(data) {
    tomographyPanel.style.display = "block";
    tomographyDesc.textContent = `Tomography sampling results for Qubit #${data.qubit_number} (${data.shots} shots):`;

    const p0 = (data.z_freq["0"] * 100).toFixed(1);
    const p1 = (data.z_freq["1"] * 100).toFixed(1);

    const px0 = (data.x_freq["+"] * 100).toFixed(1);
    const px1 = (data.x_freq["-"] * 100).toFixed(1);

    histogramContainer.innerHTML = `
      <div style="font-weight:700; font-size:0.85rem; color:#1e293b; margin-bottom:4px;">
        1. Computational Basis (Z):
      </div>
      <div class="hist-bar-group">
        <div class="hist-label-row">
          <span>|0⟩: ${data.z_counts["0"]} shots (${p0}%)</span>
        </div>
        <div class="hist-bar-track">
          <div class="hist-bar-fill" style="width: ${p0}%;">${p0}%</div>
        </div>
      </div>
      <div class="hist-bar-group">
        <div class="hist-label-row">
          <span>|1⟩: ${data.z_counts["1"]} shots (${p1}%)</span>
        </div>
        <div class="hist-bar-track">
          <div class="hist-bar-fill" style="width: ${p1}%;">${p1}%</div>
        </div>
      </div>

      <div style="font-weight:700; font-size:0.85rem; color:#1e293b; margin:8px 0 4px 0;">
        2. Diagonal Basis (X):
      </div>
      <div class="hist-bar-group">
        <div class="hist-label-row">
          <span>|+⟩: ${data.x_counts["+"]} shots (${px0}%)</span>
        </div>
        <div class="hist-bar-track">
          <div class="hist-bar-fill alt" style="width: ${px0}%;">${px0}%</div>
        </div>
      </div>
      <div class="hist-bar-group">
        <div class="hist-label-row">
          <span>|-⟩: ${data.x_counts["-"]} shots (${px1}%)</span>
        </div>
        <div class="hist-bar-track">
          <div class="hist-bar-fill alt" style="width: ${px1}%;">${px1}%</div>
        </div>
      </div>

      <div style="background:#e0f2fe; padding:8px; border-radius:4px; font-size:0.85rem; margin-top:8px;">
        <strong>Reconstructed Statevector:</strong><br>
        <span style="font-family:monospace; font-weight:bold;">
          |ψ̂⟩ ≈ ${data.est_alpha.toFixed(3)}|0⟩ + ${data.est_beta.toFixed(3)}|1⟩
        </span>
        <div style="font-size:0.75rem; color:#0369a1; margin-top:2px;">
          Estimated |α|² = ${(data.est_alpha**2).toFixed(3)}, |β|² = ${(data.est_beta**2).toFixed(3)}
        </div>
      </div>
    `;

    tomographyPanel.scrollIntoView({ behavior: "smooth" });
  }

  btnCloseTomography.addEventListener("click", () => {
    tomographyPanel.style.display = "none";
  });

  btnShareHistogram.addEventListener("click", () => {
    if (!state.latestTomography) return;
    const d = state.latestTomography;
    const p0 = (d.z_freq["0"] * 100).toFixed(1);
    const p1 = (d.z_freq["1"] * 100).toFixed(1);
    socket.emit("send_classical_message", {
      message: `[Tomography Report] Qubit #${d.qubit_number} sampled with ${d.shots} shots: P(0)=${p0}%, P(1)=${p1}% ➔ Reconstructed State: |ψ̂⟩ ≈ ${d.est_alpha.toFixed(3)}|0⟩ + ${d.est_beta.toFixed(3)}|1⟩`,
    });
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
    quantumLogs.appendChild(entry);
    quantumLogs.scrollTop = quantumLogs.scrollHeight;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
});
