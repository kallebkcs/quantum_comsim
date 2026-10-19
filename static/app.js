/**
 * Quantum Channel Simulator - BELL Modern Frontend Controller
 * Default English with on-the-fly Portuguese Translation System,
 * Access Gatekeeper, Left Operations Drawer, and Unified Chat Stream.
 */

document.addEventListener("DOMContentLoaded", () => {
  const socket = io();

  // Helper selector
  const $ = (id) => document.getElementById(id);

  // Clear any legacy auto-join keys from localStorage so page loads always start fresh
  localStorage.removeItem("bell_room");
  localStorage.removeItem("bell_handle");
  localStorage.removeItem("qcomsim_room");
  localStorage.removeItem("qcomsim_handle");

  // Application State
  const state = {
    lang: localStorage.getItem("bell_lang") || "en",
    username: "",
    room: "",
    password: "",
    inRoom: false,
    mySid: null,
    peers: [],
    activeQubits: [],
    classicalRecords: [],
    selectedQubitIds: [], // 0-based ordered selection of qubit IDs
    chatFilter: "all",    // "all" or "private"
    messages: [],
    logs: [],
    latestTomography: null,
  };

  // ==========================================================================
  // Bilingual Translation Dictionary (EN default, PT optional)
  // ==========================================================================
  const I18N = {
    en: {
      open_drawer: "OPERATIONS",
      room_label_title: "ROOM",
      handle_label_title: "HANDLE",
      status_label_title: "STATUS",
      status_connected: "Online",
      status_disconnected: "Disconnected",
      rooms_btn: "ROOMS",
      panel_qubits: "QUANTUM INVENTORY",
      your_qubits: "Your Qubits",
      select_all: "SELECT ALL",
      deselect: "DESELECT",
      selection_microcopy: "Select in sequence: first qubit is control (0) and subsequent are targets (1, 2...).",
      empty_inventory_title: "Your inventory is empty",
      empty_inventory_desc: "Use the lateral Operations ribbon to prepare your first quantum state.",
      btn_prep_first: "PREPARE QUBIT",
      current_selection: "CURRENT SELECTION",
      no_qubits_selected: "no qubits selected",
      panel_chat: "CLASSICAL CHANNEL",
      chat_title: "Room Chat",
      chat_filter_all: "ALL",
      chat_filter_private: "PRIVATE",
      chat_filter_hint: "Feed view",
      chat_dest_public: "To: Room (Public)",
      chat_empty: "No messages in this room.",
      chat_placeholder: "Type a classical message...",
      btn_send: "SEND",
      panel_bits: "CLASSICAL REGISTER",
      bits_title: "Bit Inventory",
      btn_clear: "CLEAR",
      no_measurements: "No measurements recorded yet.",
      panel_transmitter: "QUANTUM CHANNEL",
      transmitter_title: "Qubit Transmitter",
      btn_log: "LOG",
      btn_create: "CREATE",
      qty_label: "Qty:",
      basis_comp_title_short: "Computational",
      basis_diag_title_short: "Diagonal",
      basis_circ_title_short: "Circular",
      origin_label: "ORIGIN",
      dest_label: "DESTINATION",
      select_node: "-- Select Recipient Node --",
      selected_qubits_summary: "SELECTED QUBITS",
      btn_transmit: "TRANSMIT QUBIT(S) →",
      tab_prepare: "PREPARE",
      tab_gates: "GATES",
      tab_measure: "MEASURE",
      tab_protocols: "PROTOCOLS",
      tab_entangle: "D.E.",
      tab_log: "LOG",
      prep_heading: "State Preparation",
      prep_desc: "Basis, Bell, GHZ, or generic Bloch states.",
      quantity_label: "QUANTITY",
      basis_zx_label: "Z & X BASES",
      bell_pairs_label: "BELL PAIRS (EPR)",
      epr_reference_title: "EPR / BELL STATES REFERENCE",
      ghz_label: "GHZ STATE (N ≥ 3)",
      btn_prep_ghz: "PREPARE GHZ",
      generic_label: "GENERIC STATE · BLOCH SPHERE",
      polar_angle: "POLAR ANGLE θ",
      phase_angle: "PHASE φ",
      btn_prep_generic: "PREPARE STATE |ψ⟩",
      gates_heading: "Quantum Gates",
      gates_desc: "Applied to selected qubits in inventory.",
      cnot_sub: "Control (0) → Targets (1..N)",
      pauli_string_label: "PAULI STRING",
      btn_apply: "APPLY",
      pauli_hint: "String length must match number of selected qubits.",
      measure_heading: "Measurements",
      measure_desc: "Collapse quantum states into classical bit records.",
      tomo_title: "NON-DESTRUCTIVE SAMPLING & TOMOGRAPHY",
      tomo_desc: "Sample joint state non-destructively in Z, X, or Y basis.",
      btn_sample_z: "SAMPLE Z",
      btn_sample_x: "SAMPLE X",
      btn_sample_y: "SAMPLE Y",
      btn_complete_tomo: "COMPLETE TOMOGRAPHY",
      btn_share_chat: "SHARE IN CHAT ↗",
      custom_seq_label: "CUSTOM BASIS SEQUENCE",
      btn_measure: "MEASURE",
      btn_random_bases_seq: "GENERATE RANDOM BASES (Z/X)",
      protocols_heading: "Protocol Utilities",
      protocols_desc: "Encoders, key distillers, basis comparers, and RNG.",
      proto_tab_encoder: "Encoder",
      proto_tab_compare: "Compare",
      proto_tab_sift: "Key Extractor",
      bb84_title: "Qubit Encoder",
      btn_encode_bb84: "ENCODE QUBITS",
      basis_comp_title: "Basis Comparison",
      btn_compare: "COMPARE",
      sifted_key_title: "Sifted Key Extractor",
      btn_extract: "EXTRACT KEY",
      rng_title: "Random Bit & Basis Generator",
      btn_generate: "GENERATE",
      de_heading: "Entanglement Distributor",
      de_desc: "Distribute an entangled Bell or GHZ state across participants.",
      de_select_nodes: "SELECT ROOM PARTICIPANTS",
      de_summary_2: "2 participants → Bell Pair |Φ+⟩",
      de_summary_3: "3+ participants → GHZ N",
      btn_distribute: "CREATE & DISTRIBUTE",
      waiting_peers: "Waiting for other peers to connect...",
      log_heading: "Quantum Operations Log",
      log_desc: "Private session event stream.",
      btn_clear_log: "CLEAR LOG",
      no_operations: "No operations performed yet.",
      room_directory_title: "Quantum Rooms",
      room_directory_desc: "Create a lab or join an active room to begin.",
      tab_available_rooms: "AVAILABLE ROOMS",
      tab_create_room: "CREATE ROOM",
      search_room: "SEARCH ROOM",
      search_room_placeholder: "Room name or ID...",
      your_handle: "YOUR HANDLE",
      handle_placeholder: "Choose a name",
      room_password_label: "ROOM PASSWORD",
      room_password_placeholder: "Only if protected",
      create_room_name: "ROOM NAME",
      capacity_limit: "CAPACITY LIMIT",
      optional_password: "PASSWORD (OPTIONAL)",
      public_directory_check: "Show in public directory",
      btn_create_submit: "CREATE & ENTER ROOM",
      no_rooms_available: "No active rooms yet. Create the first one!",
      entangled_state_label: "Entangled State",
      click_to_select_group: "Click to select group",
      group_selected: "Group Selected",
      you_label: "You",
    },
    pt: {
      open_drawer: "OPERAÇÕES",
      room_label_title: "SALA",
      handle_label_title: "USUÁRIO",
      status_label_title: "STATUS",
      status_connected: "Online",
      status_disconnected: "Desconectado",
      rooms_btn: "SALAS",
      panel_qubits: "INVENTÁRIO QUÂNTICO",
      your_qubits: "Seus Qubits",
      select_all: "SELECIONAR TODOS",
      deselect: "DESMARCAR",
      selection_microcopy: "Selecione em sequência: o primeiro qubit será o controle (0) e os seguintes serão os alvos (1, 2...).",
      empty_inventory_title: "Seu inventário está vazio",
      empty_inventory_desc: "Use a barra lateral de Operações para preparar o primeiro estado quântico.",
      btn_prep_first: "PREPARAR QUBIT",
      current_selection: "SELEÇÃO ATUAL",
      no_qubits_selected: "nenhum qubit selecionado",
      panel_chat: "CANAL CLÁSSICO",
      chat_title: "Chat da Sala",
      chat_filter_all: "TODAS",
      chat_filter_private: "PRIVADO",
      chat_filter_hint: "Visualização",
      chat_dest_public: "Para: Sala (Pública)",
      chat_empty: "Nenhuma mensagem nesta sala.",
      chat_placeholder: "Escreva uma mensagem clássica...",
      btn_send: "ENVIAR",
      panel_bits: "REGISTRO CLÁSSICO",
      bits_title: "Inventário de Bits",
      btn_clear: "LIMPAR",
      no_measurements: "Nenhuma medição realizada.",
      panel_transmitter: "CANAL QUÂNTICO",
      transmitter_title: "Transmissor de Qubits",
      btn_log: "LOG",
      btn_create: "CRIAR",
      qty_label: "Qtd:",
      basis_comp_title_short: "Computacional",
      basis_diag_title_short: "Diagonal",
      basis_circ_title_short: "Circular",
      origin_label: "ORIGEM",
      dest_label: "DESTINO",
      select_node: "-- Selecionar Nó Destino --",
      selected_qubits_summary: "QUBITS SELECIONADOS",
      btn_transmit: "TRANSMITIR QUBIT(S) →",
      tab_prepare: "PREPARAR",
      tab_gates: "PORTAS",
      tab_measure: "MEDIR",
      tab_protocols: "PROTOCOLOS",
      tab_entangle: "D.E.",
      tab_log: "LOG",
      prep_heading: "Preparação de Estados",
      prep_desc: "Crie estados das bases, Bell, GHZ ou genéricos.",
      quantity_label: "QUANTIDADE",
      basis_zx_label: "BASES Z & X",
      bell_pairs_label: "PARES DE BELL (EPR)",
      epr_reference_title: "REFERÊNCIA EPR / ESTADOS DE BELL",
      ghz_label: "ESTADO GHZ (N ≥ 3)",
      btn_prep_ghz: "PREPARAR GHZ",
      generic_label: "ESTADO GENÉRICO · ESFERA DE BLOCH",
      polar_angle: "ÂNGULO POLAR θ",
      phase_angle: "FASE φ",
      btn_prep_generic: "PREPARAR ESTADO |ψ⟩",
      gates_heading: "Portas Quânticas",
      gates_desc: "Aplicadas aos qubits selecionados no inventário.",
      cnot_sub: "Controle (0) → Alvos (1..N)",
      pauli_string_label: "PAULI STRING",
      btn_apply: "APLICAR",
      pauli_hint: "O tamanho da string deve coincidir com os qubits selecionados.",
      measure_heading: "Medições",
      measure_desc: "Colapse os estados e envie resultados ao inventário de bits.",
      tomo_title: "AMOSTRAGEM NÃO DESTRUTIVA E TOMOGRAFIA",
      tomo_desc: "Amostre o estado conjunto nas bases Z, X ou Y sem colapso.",
      btn_sample_z: "AMOSTRAR Z",
      btn_sample_x: "AMOSTRAR X",
      btn_sample_y: "AMOSTRAR Y",
      btn_complete_tomo: "TOMOGRAFIA COMPLETA",
      btn_share_chat: "COMPARTILHAR NO CHAT ↗",
      custom_seq_label: "SEQUÊNCIA DE BASES PERSONALIZADA",
      btn_measure: "MEDIR",
      btn_random_bases_seq: "GERAR BASES ALEATÓRIAS (Z/X)",
      protocols_heading: "Utilitários de Protocolos",
      protocols_desc: "Codificação, comparação, extração e geração.",
      proto_tab_encoder: "Codificador",
      proto_tab_compare: "Comparar",
      proto_tab_sift: "Extrator",
      bb84_title: "Codificador de Qubits",
      btn_encode_bb84: "CODIFICAR QUBITS",
      basis_comp_title: "Comparador de Bases",
      btn_compare: "COMPARAR",
      sifted_key_title: "Extrator de Chave Filtrada",
      btn_extract: "EXTRAIR CHAVE",
      rng_title: "Gerador Aleatório de Bits & Bases",
      btn_generate: "GERAR",
      de_heading: "Distribuidor de Emaranhamento",
      de_desc: "Distribua um estado Bell ou GHZ entre os nós escolhidos.",
      de_select_nodes: "SELECIONE OS PARTICIPANTES DA SALA",
      de_summary_2: "2 participantes → Par Bell |Φ+⟩",
      de_summary_3: "3+ participantes → GHZ N",
      btn_distribute: "CRIAR & DISTRIBUIR",
      waiting_peers: "Aguardando outros participantes conectarem-se...",
      log_heading: "Histórico de Operações Quânticas",
      log_desc: "Histórico privado desta sessão.",
      btn_clear_log: "LIMPAR LOG",
      no_operations: "Nenhuma operação realizada.",
      room_directory_title: "Salas Quânticas",
      room_directory_desc: "Crie um laboratório ou entre em uma sala disponível.",
      tab_available_rooms: "SALAS DISPONÍVEIS",
      tab_create_room: "CRIAR SALA",
      search_room: "BUSCAR SALA",
      search_room_placeholder: "Nome ou ID da sala...",
      your_handle: "SEU NOME / HANDLE",
      handle_placeholder: "Escolha um nome",
      room_password_label: "SENHA DA SALA",
      room_password_placeholder: "Somente se protegida",
      create_room_name: "NOME DA SALA",
      capacity_limit: "LIMITE DE PESSOAS",
      optional_password: "SENHA (OPCIONAL)",
      public_directory_check: "Exibir no diretório público",
      btn_create_submit: "CRIAR & ENTRAR NA SALA",
      no_rooms_available: "Nenhuma sala ativa no momento. Crie a primeira sala!",
      entangled_state_label: "Estado Emaranhado",
      click_to_select_group: "Clique para selecionar grupo",
      group_selected: "Grupo Selecionado",
      you_label: "Você",
    },
  };

  function setLanguage(lang) {
    state.lang = lang in I18N ? lang : "en";
    localStorage.setItem("bell_lang", state.lang);
    const dict = I18N[state.lang];

    // Update Lang button text
    if ($("lang-text")) $("lang-text").textContent = state.lang.toUpperCase();

    // Update text for all elements with data-i18n
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      if (dict[key]) el.textContent = dict[key];
    });

    // Update placeholders
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.dataset.i18nPlaceholder;
      if (dict[key]) el.placeholder = dict[key];
    });

    // Update dynamic views
    renderQubits();
    renderBits();
    renderMessages();
    renderLog();
    updateRecipientDropdown();
    updateParticipantList();
  }

  // ==========================================================================
  // DOM Elements
  // ==========================================================================
  const toastContainer = $("toast-container");
  const mainWorkspace = $("main-workspace");
  const roomLabel = $("room-label");
  const handleLabel = $("handle-label");
  const sourceNode = $("source-node");
  const recipientSelect = $("recipient");
  const transmitCount = $("transmit-count");
  const btnTransmit = $("transmit");
  const statusDot = $("status-dot");
  const connectionStatusText = $("connection-status-text");

  const qubitList = $("qubit-list");
  const qubitCount = $("qubit-count");
  const selectAllBtn = $("select-all");
  const clearSelectionBtn = $("clear-selection");
  const selectionReadout = $("selection-readout");

  const bitsList = $("bits-list");
  const bitCount = $("bit-count");
  const btnClearBits = $("clear-bits");

  const messagesContainer = $("messages");
  const chatForm = $("chat-form");
  const chatInput = $("chat-input");
  const chatRecipientSelect = $("chat-recipient-select");
  const chatFilterAll = $("chat-filter-all");
  const chatFilterPrivate = $("chat-filter-private");

  const quantumRibbon = $("quantum-ribbon");
  const ribbonPrepGroup = $("ribbon-prep-group");
  const ribbonGatesGroup = $("ribbon-gates-group");
  const ribbonSelectionBadge = $("ribbon-selection-badge");
  const ribbonSelCount = $("ribbon-sel-count");
  const ribbonPopovers = $("ribbon-popovers");
  const btnChannelLog = $("btn-channel-log");
  const btnRibbonLog = $("btn-ribbon-log");
  const btnRibbonZero = $("btn-ribbon-zero");
  const btnRibbonPlus = $("btn-ribbon-plus");
  const btnRibbonPlusI = $("btn-ribbon-plus-i");

  const roomDialog = $("room-dialog");
  const btnOpenRoom = $("open-room");
  const btnCloseRoomDialog = $("close-room-dialog");
  const availableRoomList = $("available-room-list");
  const roomSearchInput = $("room-search");
  const handleInput = $("handle-input");
  const joinPassword = $("join-password");
  const createRoomInput = $("create-room-input");
  const createHandleInput = $("create-handle-input");
  const roomLimitInput = $("room-limit");
  const createRoomPassword = $("create-room-password");
  const createRoomPublic = $("create-room-public");
  const btnCreateRoomSubmit = $("btn-create-room-submit");

  const participantList = $("participant-list");
  const btnDistributeEntanglement = $("distribute-entanglement");

  const operationLog = $("operation-log");
  const btnClearLog = $("clear-log");

  const langToggle = $("lang-toggle");
  const themeToggle = $("theme-toggle");
  const themeIcon = $("theme-icon");

  const now = () => new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  function showToast(message) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    toastContainer.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 250);
    }, 2800);
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ==========================================================================
  // Socket.IO Events
  // ==========================================================================
  // Ensure page refresh or tab close immediately disconnects the socket from the room
  window.addEventListener("beforeunload", () => {
    socket.disconnect();
  });
  window.addEventListener("pagehide", () => {
    socket.disconnect();
  });

  function showDialogError(msg) {
    showToast(msg);
    const dialogErr = $("room-dialog-error");
    if (dialogErr) {
      dialogErr.textContent = msg;
      dialogErr.style.display = "flex";
    }
  }

  // ==========================================================================
  // Socket.IO Events
  // ==========================================================================
  socket.on("connect", () => {
    state.mySid = socket.id;
    statusDot.classList.add("connected");
    connectionStatusText.textContent = state.lang === "pt" ? "Conectado" : "Online";

    // Request available rooms
    socket.emit("get_available_rooms");

    // Only auto-rejoin if user had already entered a room in this active page lifecycle
    if (state.inRoom && state.room && state.username) {
      socket.emit("join_room", {
        room: state.room,
        username: state.username,
        password: state.password || "",
      });
    } else {
      mainWorkspace.classList.add("is-locked");
      try {
        if (!roomDialog.open) roomDialog.showModal();
      } catch (e) {}
    }
  });

  socket.on("disconnect", () => {
    statusDot.classList.remove("connected");
    connectionStatusText.textContent = state.lang === "pt" ? "Desconectado" : "Disconnected";
    showToast(state.lang === "pt" ? "Conexão perdida com o servidor." : "Connection lost with server.");
  });

  socket.on("join_success", (data) => {
    const isNewRoomJoin = !state.inRoom || state.room !== data.room;
    state.inRoom = true;
    state.room = data.room;
    state.username = data.username;
    state.mySid = data.sid;

    if (isNewRoomJoin) {
      state.messages = [];
      state.logs = [];
      renderMessages();
      renderLog();
    }

    const dialogErr = $("room-dialog-error");
    if (dialogErr) dialogErr.style.display = "none";

    roomLabel.textContent = state.room;
    handleLabel.textContent = state.username;
    sourceNode.textContent = `${state.username} (${I18N[state.lang].you_label})`;

    // Unlock simulator workspace
    mainWorkspace.classList.remove("is-locked");
    if (roomDialog.open) roomDialog.close();

    showToast(state.lang === "pt" ? `Conectado à sala '${state.room}' como '${state.username}'` : `Joined room '${state.room}' as '${state.username}'`);
  });

  socket.on("room_status", (data) => {
    state.peers = data.users || [];
    const count = state.peers.length;
    const nodeText = count === 1 ? (state.lang === "pt" ? "1 Nó" : "1 Node") : (state.lang === "pt" ? `${count} Nós` : `${count} Nodes`);
    connectionStatusText.textContent = `${state.lang === "pt" ? "Online" : "Online"} · ${nodeText}`;

    updateRecipientDropdown();
    updateParticipantList();
    updateChatRecipientDropdown();
  });

  socket.on("inventory_update", (data) => {
    state.activeQubits = data.active_qubits || [];
    state.classicalRecords = data.classical_records || [];

    const activeIds = new Set(state.activeQubits.map((q) => q.id));
    state.selectedQubitIds = state.selectedQubitIds.filter((id) => activeIds.has(id));

    renderQubits();
    renderBits();
  });

  socket.on("available_rooms", (rooms) => {
    renderAvailableRooms(rooms);
  });

  socket.on("classical_message", (msg) => {
    state.messages.push(msg);
    renderMessages();
  });

  socket.on("chat_history", (history) => {
    state.messages = history || [];
    renderMessages();
  });

  socket.on("quantum_event", (event) => {
    state.logs.unshift(event);
    renderLog();
  });

  socket.on("quantum_logs_history", (history) => {
    state.logs = (history || []).slice().reverse();
    renderLog();
  });

  socket.on("action_error", (data) => {
    const msg = data.message || (state.lang === "pt" ? "Erro na ação." : "Action error.");
    if (!state.inRoom) {
      mainWorkspace.classList.add("is-locked");
      try {
        if (!roomDialog.open) roomDialog.showModal();
      } catch (e) {}
    }
    showDialogError(msg);
  });

  socket.on("sample_results", (data) => {
    state.latestTomography = data;
    renderSamplingResults(data);
  });

  socket.on("tomography_complete_results", (data) => {
    state.latestTomography = data;
    renderCompleteTomographyResults(data);
  });

  socket.on("batch_measure_results", (data) => {
    showToast(state.lang === "pt" ? `Medição concluída! Bitstring: [${data.bitstring}]` : `Measurement complete! Bitstring: [${data.bitstring}]`);
  });

  // ==========================================================================
  // Gatekeeper & Room Directory Handlers
  // ==========================================================================
  function joinRoom(room, username, password = "", limit = 8, isPublic = true) {
    if (!username || !username.trim()) {
      showDialogError(state.lang === "pt" ? "Por favor, escolha um nome de usuário." : "Please choose a username handle.");
      return;
    }
    if (!room || !room.trim()) {
      showDialogError(state.lang === "pt" ? "Por favor, informe o nome da sala." : "Please specify a room name.");
      return;
    }

    state.password = password;
    socket.emit("join_room", {
      room: room.trim(),
      username: username.trim(),
      password: password,
      limit: limit,
      is_public: isPublic,
    });
  }

  btnOpenRoom.addEventListener("click", () => {
    socket.emit("get_available_rooms");
    if (handleInput && state.username) handleInput.value = state.username;
    if (createHandleInput && state.username) createHandleInput.value = state.username;
    roomDialog.showModal();
  });

  btnCloseRoomDialog.addEventListener("click", () => {
    if (!state.inRoom) {
      showDialogError(state.lang === "pt" ? "Você deve entrar ou criar uma sala para continuar." : "You must enter or create a room to continue.");
      return;
    }
    roomDialog.close();
  });

  // Room Dialog Tabs
  document.querySelectorAll("[data-room-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-room-tab]").forEach((b) => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".room-tab-view").forEach((view) => {
        view.classList.toggle("active", view.id === "room-tab-" + btn.dataset.roomTab);
      });
      const dialogErr = $("room-dialog-error");
      if (dialogErr) dialogErr.style.display = "none";
      if (btn.dataset.roomTab === "available") {
        socket.emit("get_available_rooms");
      }
    });
  });

  // Room Search filter
  roomSearchInput.addEventListener("input", () => {
    const term = roomSearchInput.value.toLowerCase().trim();
    document.querySelectorAll("#available-room-list article").forEach((card) => {
      const name = card.dataset.roomName.toLowerCase();
      card.style.display = name.includes(term) ? "grid" : "none";
    });
  });

  function renderAvailableRooms(rooms) {
    if (!rooms || rooms.length === 0) {
      availableRoomList.innerHTML = `<div class="inline-empty">${I18N[state.lang].no_rooms_available}</div>`;
      return;
    }

    availableRoomList.innerHTML = rooms
      .map((r) => {
        const symbolLetter = (r.name[0] || "Q").toUpperCase();
        const isProtected = r.has_password;
        const lockText = isProtected ? (state.lang === "pt" ? "SENHA" : "PASS") : (state.lang === "pt" ? "LIVRE" : "OPEN");
        const enterText = state.lang === "pt" ? "ENTRAR" : "JOIN";
        return `
          <article data-room-name="${escapeHtml(r.name)}" data-protected="${isProtected}">
            <div class="room-symbol"><i></i>${symbolLetter}</div>
            <div>
              <strong>${escapeHtml(r.name)}</strong>
              <span>${r.user_count}/${r.max_users} NODES</span>
            </div>
            <small class="${isProtected ? 'locked' : ''}">${lockText}</small>
            <button type="button" class="btn-join-room-card">${enterText}</button>
          </article>
        `;
      })
      .join("");

    availableRoomList.querySelectorAll(".btn-join-room-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest("article");
        const roomName = card.dataset.roomName;
        const isProtected = card.dataset.protected === "true";

        const user = handleInput.value.trim();
        if (!user) {
          showDialogError(state.lang === "pt" ? "Por favor, escolha um nome de usuário." : "Please choose a username handle.");
          handleInput.focus();
          return;
        }

        const pwd = joinPassword.value.trim();

        if (isProtected && !pwd) {
          showDialogError(state.lang === "pt" ? "Esta sala requer senha." : "This room requires a password.");
          joinPassword.focus();
          return;
        }

        joinRoom(roomName, user, pwd);
      });
    });
  }

  [handleInput, joinPassword, createRoomInput, createHandleInput, createRoomPassword].forEach((inp) => {
    if (inp) {
      inp.addEventListener("input", () => {
        const dialogErr = $("room-dialog-error");
        if (dialogErr) dialogErr.style.display = "none";
      });
    }
  });

  btnCreateRoomSubmit.addEventListener("click", () => {
    const roomName = createRoomInput.value.trim();
    const handle = createHandleInput.value.trim();
    const limit = parseInt(roomLimitInput.value) || 8;
    const pwd = createRoomPassword.value.trim();
    const isPublic = createRoomPublic.checked;

    if (!roomName) {
      showDialogError(state.lang === "pt" ? "Por favor, informe o nome da sala." : "Please specify a room name.");
      createRoomInput.focus();
      return;
    }
    if (!handle) {
      showDialogError(state.lang === "pt" ? "Por favor, escolha um nome de usuário." : "Please choose a username handle.");
      createHandleInput.focus();
      return;
    }

    joinRoom(roomName, handle, pwd, limit, isPublic);
  });

  // ==========================================================================
  // Permanent Thin Lateral Operations Ribbon & Context-Aware Popovers
  // ==========================================================================
  function closePopovers() {
    document.querySelectorAll(".ribbon-popover").forEach((p) => {
      p.classList.remove("open", "is-modal-popup");
    });
    document.querySelectorAll(".ribbon-btn").forEach((b) => b.classList.remove("active"));
    if (btnChannelLog) btnChannelLog.classList.remove("active");
    const backdrop = $("log-modal-backdrop");
    if (backdrop) backdrop.classList.remove("open");
  }

  function togglePopover(targetId, triggerBtn) {
    const popover = $(targetId);
    if (!popover) return;
    const wasOpen = popover.classList.contains("open");
    closePopovers();

    if (!wasOpen) {
      popover.classList.add("open");
      if (triggerBtn) triggerBtn.classList.add("active");

      if (targetId === "popover-log") {
        // Open Log as a centered modal pop-up above the backdrop
        popover.classList.add("is-modal-popup");
        popover.style.position = "fixed";
        popover.style.top = "";
        popover.style.left = "";
        const backdrop = $("log-modal-backdrop");
        if (backdrop) {
          backdrop.onclick = () => closePopovers();
          backdrop.classList.add("open");
        }
      } else if (triggerBtn) {
        const btnRect = triggerBtn.getBoundingClientRect();
        const top = btnRect.top + window.scrollY;
        const left = btnRect.right + window.scrollX + 12;
        popover.style.position = "absolute";
        popover.style.top = `${Math.round(top)}px`;
        popover.style.left = `${Math.round(left)}px`;
      }
    }
  }

  // Popover Trigger Buttons
  document.querySelectorAll("[data-popover-target]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePopover(btn.dataset.popoverTarget, btn);
    });
  });

  // Close Popover Buttons
  document.querySelectorAll("[data-close-popover]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      closePopovers();
    });
  });

  // Click outside to close popovers
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".ribbon-popover") && !e.target.closest(".ribbon-btn") && !e.target.closest("#btn-channel-log")) {
      closePopovers();
    }
  });

  // Escape key closes popovers
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePopovers();
  });

  // Channel Log Button
  if (btnChannelLog) {
    btnChannelLog.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePopover("popover-log", btnChannelLog);
    });
  }

  // Context-Aware Ribbon: Prep mode vs Gates mode
  function updateRibbonMode() {
    if (!ribbonPrepGroup || !ribbonGatesGroup) return;
    const hasSelected = state.selectedQubitIds.length > 0;
    if (hasSelected) {
      ribbonPrepGroup.style.display = "none";
      ribbonGatesGroup.style.display = "flex";
      if (ribbonSelCount) ribbonSelCount.textContent = state.selectedQubitIds.length;
      const btnCnot = $("btn-ribbon-cnot");
      if (btnCnot) btnCnot.style.opacity = state.selectedQubitIds.length >= 2 ? "1" : "0.45";
      const btnBell = $("btn-ribbon-bell-meas");
      if (btnBell) btnBell.style.opacity = (state.selectedQubitIds.length >= 2 && state.selectedQubitIds.length % 2 === 0) ? "1" : "0.45";
    } else {
      ribbonPrepGroup.style.display = "flex";
      ribbonGatesGroup.style.display = "none";
      const gatePopover = document.querySelector("#popover-pauli.open, #popover-custom-seq.open, #popover-sample.open");
      if (gatePopover) closePopovers();
    }
  }

  // Ribbon Selection Deselect Badge
  if (ribbonSelectionBadge) {
    ribbonSelectionBadge.addEventListener("click", () => {
      state.selectedQubitIds = [];
      renderQubits();
    });
  }

  // Direct preparation on ribbon buttons
  if (btnRibbonZero) {
    btnRibbonZero.addEventListener("click", (e) => {
      if (!e.target.closest(".ribbon-flyout")) {
        socket.emit("prepare_state", { state: "0", quantity: 1 });
        showToast(state.lang === "pt" ? "Qubit |0⟩ preparado." : "Prepared 1x |0⟩ qubit.");
      }
    });
  }

  if (btnRibbonPlus) {
    btnRibbonPlus.addEventListener("click", (e) => {
      if (!e.target.closest(".ribbon-flyout")) {
        socket.emit("prepare_state", { state: "+", quantity: 1 });
        showToast(state.lang === "pt" ? "Qubit |+⟩ preparado." : "Prepared 1x |+⟩ qubit.");
      }
    });
  }

  if (btnRibbonPlusI) {
    btnRibbonPlusI.addEventListener("click", (e) => {
      if (!e.target.closest(".ribbon-flyout")) {
        socket.emit("prepare_state", { state: "+i", quantity: 1 });
        showToast(state.lang === "pt" ? "Qubit |+i⟩ preparado." : "Prepared 1x |+i⟩ qubit.");
      }
    });
  }

  const btnRibbonBell = $("btn-ribbon-bell");
  if (btnRibbonBell) {
    btnRibbonBell.addEventListener("click", (e) => {
      if (!e.target.closest(".ribbon-flyout")) {
        socket.emit("prepare_state", { state_type: "phi+", count: 1 });
        showToast(state.lang === "pt" ? "Par EPR |Φ⁺⟩ preparado." : "Prepared 1x |Φ⁺⟩ Bell pair.");
      }
    });
  }

  const btnFlyoutBellCreate = $("btn-flyout-bell-create");
  if (btnFlyoutBellCreate) {
    btnFlyoutBellCreate.addEventListener("click", (e) => {
      e.stopPropagation();
      const flyout = $("flyout-bell");
      const activeChoice = flyout ? flyout.querySelector(".flyout-choice-btn.active") : null;
      const targetState = activeChoice ? activeChoice.dataset.flyoutState : "phi+";
      const qtyInput = $("flyout-bell-qty");
      const qty = parseInt(qtyInput ? qtyInput.value : "1", 10) || 1;
      socket.emit("prepare_state", { state_type: targetState, count: qty });
      showToast(state.lang === "pt" ? `Preparado ${qty}x par Bell.` : `Prepared ${qty}x Bell pair.`);
    });
  }

  const btnFlyoutGhzCreate = $("btn-flyout-ghz-create");
  if (btnFlyoutGhzCreate) {
    btnFlyoutGhzCreate.addEventListener("click", (e) => {
      e.stopPropagation();
      const ghzSizeInput = $("flyout-ghz-size");
      const n = parseInt(ghzSizeInput ? ghzSizeInput.value : "3", 10) || 3;
      socket.emit("prepare_ghz", { n: n });
      showToast(state.lang === "pt" ? `Preparando estado GHZ de ${n} qubits.` : `Preparing ${n}-qubit GHZ state.`);
    });
  }

  // Flyout chip choices and action buttons (excluding #flyout-bell which has dedicated Bell & GHZ buttons)
  document.querySelectorAll(".ribbon-flyout").forEach((flyout) => {
    const choices = flyout.querySelectorAll(".flyout-choice-btn");
    choices.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        choices.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });

    if (flyout.id === "flyout-bell") return;

    const actionBtn = flyout.querySelector(".flyout-action-btn");
    const qtyInput = flyout.querySelector(".flyout-qty-input");
    if (actionBtn) {
      actionBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const activeChoice = flyout.querySelector(".flyout-choice-btn.active");
        const targetState = activeChoice ? activeChoice.dataset.flyoutState : "0";
        const qty = parseInt(qtyInput ? qtyInput.value : "1", 10) || 1;
        socket.emit("prepare_state", { state: targetState, quantity: qty });
        showToast(state.lang === "pt" ? `Preparado ${qty}x |${targetState}⟩.` : `Prepared ${qty}x |${targetState}⟩.`);
      });
    }
  });

  // Protocols popover sub-tabs
  document.querySelectorAll(".proto-tab-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".proto-tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".proto-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      const targetPanel = $("proto-panel-" + btn.dataset.proto);
      if (targetPanel) targetPanel.classList.add("active");
    });
  });

  // ==========================================================================
  // Qubit Inventory & Selection
  // ==========================================================================
  function toggleQubitSelection(qid) {
    const idx = state.selectedQubitIds.indexOf(qid);
    if (idx === -1) {
      state.selectedQubitIds.push(qid);
    } else {
      state.selectedQubitIds.splice(idx, 1);
    }
    renderQubits();
  }

  function toggleGroupSelection(qids) {
    const allSelected = qids.every((id) => state.selectedQubitIds.includes(id));
    if (allSelected) {
      state.selectedQubitIds = state.selectedQubitIds.filter((id) => !qids.includes(id));
    } else {
      qids.forEach((id) => {
        if (!state.selectedQubitIds.includes(id)) {
          state.selectedQubitIds.push(id);
        }
      });
    }
    renderQubits();
  }

  selectAllBtn.addEventListener("click", () => {
    state.selectedQubitIds = state.activeQubits.map((q) => q.id);
    renderQubits();
  });

  clearSelectionBtn.addEventListener("click", () => {
    state.selectedQubitIds = [];
    renderQubits();
  });

  function buildRoundedOrthoPolygonPath(pts, maxRadius = 8) {
    if (!pts || pts.length < 3) return "";
    // Remove consecutive duplicate points
    const clean = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = clean[clean.length - 1];
      if (!prev || Math.hypot(pts[i][0] - prev[0], pts[i][1] - prev[1]) > 0.5) {
        clean.push(pts[i]);
      }
    }
    if (clean.length > 1) {
      const first = clean[0];
      const last = clean[clean.length - 1];
      if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= 0.5) {
        clean.pop();
      }
    }
    const n = clean.length;
    if (n < 3) return "";

    let d = "";
    for (let i = 0; i < n; i++) {
      const prev = clean[(i - 1 + n) % n];
      const curr = clean[i];
      const next = clean[(i + 1) % n];

      const vx1 = prev[0] - curr[0];
      const vy1 = prev[1] - curr[1];
      const len1 = Math.hypot(vx1, vy1);

      const vx2 = next[0] - curr[0];
      const vy2 = next[1] - curr[1];
      const len2 = Math.hypot(vx2, vy2);

      const r = Math.min(maxRadius, len1 / 2.2, len2 / 2.2);
      const p1x = curr[0] + (vx1 / (len1 || 1)) * r;
      const p1y = curr[1] + (vy1 / (len1 || 1)) * r;
      const p2x = curr[0] + (vx2 / (len2 || 1)) * r;
      const p2y = curr[1] + (vy2 / (len2 || 1)) * r;

      if (i === 0) {
        d += `M ${p1x.toFixed(1)} ${p1y.toFixed(1)} `;
      } else {
        d += `L ${p1x.toFixed(1)} ${p1y.toFixed(1)} `;
      }
      d += `Q ${curr[0].toFixed(1)} ${curr[1].toFixed(1)} ${p2x.toFixed(1)} ${p2y.toFixed(1)} `;
    }
    d += "Z";
    return d;
  }

  function renderEntangledPolygons() {
    const svg = $("entangled-polygons-svg");
    const badgesLayer = $("entangled-badges-layer");
    if (!svg || !badgesLayer || !qubitList) return;

    const pairGroups = {};
    state.activeQubits.forEach((q) => {
      if (q.pair_id) {
        if (!pairGroups[q.pair_id]) pairGroups[q.pair_id] = [];
        pairGroups[q.pair_id].push(q);
      }
    });

    const stageRect = qubitList.getBoundingClientRect();
    const scrollTop = qubitList.scrollTop;
    const scrollLeft = qubitList.scrollLeft;
    const stageW = Math.max(qubitList.scrollWidth, qubitList.clientWidth);
    const stageH = Math.max(qubitList.scrollHeight, qubitList.clientHeight);

    svg.setAttribute("width", stageW);
    svg.setAttribute("height", stageH);
    svg.setAttribute("viewBox", `0 0 ${stageW} ${stageH}`);

    let svgHtml = "";
    let badgesHtml = "";

    Object.keys(pairGroups).forEach((pid) => {
      const group = pairGroups[pid];
      if (group.length < 2) return;

      const els = group
        .map((q) => qubitList.querySelector(`[data-q="${q.id}"]`))
        .filter(Boolean);
      if (els.length < 2) return;

      const boxes = els.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          left: r.left - stageRect.left + scrollLeft,
          right: r.right - stageRect.left + scrollLeft,
          top: r.top - stageRect.top + scrollTop,
          bottom: r.bottom - stageRect.top + scrollTop,
        };
      });

      // Group boxes by grid row
      const rowClusters = [];
      boxes.forEach((b) => {
        let row = rowClusters.find((rc) => Math.abs(rc.refTop - b.top) < 18);
        if (!row) {
          row = { refTop: b.top, items: [] };
          rowClusters.push(row);
        }
        row.items.push(b);
      });
      rowClusters.sort((a, b) => a.refTop - b.refTop);

      const PAD_X = 6;
      const PAD_Y = 6;
      const rawRows = rowClusters.map((rc) => ({
        left: Math.min(...rc.items.map((i) => i.left)) - PAD_X,
        right: Math.max(...rc.items.map((i) => i.right)) + PAD_X,
        top: Math.min(...rc.items.map((i) => i.top)) - PAD_Y,
        bottom: Math.max(...rc.items.map((i) => i.bottom)) + PAD_Y,
      }));

      // Build contiguous vertical bands so multi-line states form a single polygon
      const bands = [];
      for (let i = 0; i < rawRows.length; i++) {
        bands.push({ ...rawRows[i] });
        if (i < rawRows.length - 1) {
          const curr = bands[bands.length - 1];
          const next = rawRows[i + 1];
          const midY = (curr.bottom + next.top) / 2;
          const overlapLeft = Math.max(curr.left, next.left);
          const overlapRight = Math.min(curr.right, next.right);

          if (overlapLeft < overlapRight - 4) {
            curr.bottom = midY;
            next.top = midY;
          } else {
            // Insert thin horizontal connector band if row i and row i+1 don't overlap horizontally
            const bridgeHalf = 4;
            curr.bottom = midY - bridgeHalf;
            next.top = midY + bridgeHalf;
            bands.push({
              left: Math.min(curr.left, next.left),
              right: Math.max(curr.right, next.right),
              top: midY - bridgeHalf,
              bottom: midY + bridgeHalf,
            });
          }
        }
      }

      // Trace orthogonal polygon around bands
      const pts = [];
      pts.push([bands[0].left, bands[0].top]);
      pts.push([bands[0].right, bands[0].top]);
      for (let k = 0; k < bands.length; k++) {
        pts.push([bands[k].right, bands[k].bottom]);
        if (k < bands.length - 1 && Math.abs(bands[k + 1].right - bands[k].right) > 0.5) {
          pts.push([bands[k + 1].right, bands[k].bottom]);
        }
      }
      pts.push([bands[bands.length - 1].left, bands[bands.length - 1].bottom]);
      for (let k = bands.length - 1; k >= 0; k--) {
        pts.push([bands[k].left, bands[k].top]);
        if (k > 0 && Math.abs(bands[k - 1].left - bands[k].left) > 0.5) {
          pts.push([bands[k - 1].left, bands[k].top]);
        }
      }

      const pathData = buildRoundedOrthoPolygonPath(pts, 9);
      const pairType = group[0].pair_type || "EPR";
      const groupQids = group.map((q) => q.id);
      const allSelected = groupQids.every((id) => state.selectedQubitIds.includes(id));

      svgHtml += `
        <path
          class="entangled-polygon-path ${allSelected ? 'selected' : ''}"
          d="${pathData}"
          data-toggle-group="${groupQids.join(',')}"
        ></path>
      `;

      const badgeLeft = Math.round(bands[0].left + 10);
      const badgeTop = Math.round(bands[0].top - 9);
      badgesHtml += `
        <button
          type="button"
          class="entangled-poly-badge ${allSelected ? 'selected' : ''}"
          style="left: ${badgeLeft}px; top: ${badgeTop}px;"
          data-toggle-group="${groupQids.join(',')}"
          title="${allSelected ? I18N[state.lang].group_selected : I18N[state.lang].click_to_select_group}"
        >
          <b>∞</b> <span>${escapeHtml(pairType)}</span>
        </button>
      `;
    });

    svg.innerHTML = svgHtml;
    badgesLayer.innerHTML = badgesHtml;

    qubitList.querySelectorAll("[data-toggle-group]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const qids = el.dataset.toggleGroup.split(",");
        toggleGroupSelection(qids);
      });
    });
  }

  window.addEventListener("resize", () => {
    if (state.activeQubits.length > 0) {
      renderEntangledPolygons();
    }
  });

  function renderQubits() {
    updateRibbonMode();
    qubitCount.textContent = state.activeQubits.length;
    transmitCount.textContent = state.selectedQubitIds.length;

    // Selection Readout
    if (state.selectedQubitIds.length === 0) {
      selectionReadout.textContent = I18N[state.lang].no_qubits_selected;
    } else {
      const labels = state.selectedQubitIds.map((id) => {
        const q = state.activeQubits.find((item) => item.id === id);
        return q ? `q${q.number}` : id;
      });
      selectionReadout.textContent = labels.join(" → ");
    }

    // Transmit button disabled check
    btnTransmit.disabled = state.selectedQubitIds.length === 0 || !recipientSelect.value;

    if (state.activeQubits.length === 0) {
      qubitList.innerHTML = `
        <div class="beautiful-empty">
          <div class="empty-orbit"><i></i></div>
          <strong>${I18N[state.lang].empty_inventory_title}</strong>
          <span>${I18N[state.lang].empty_inventory_desc}</span>
          <button data-open-tools type="button">${I18N[state.lang].btn_prep_first}</button>
        </div>
      `;
      qubitList.querySelectorAll("[data-open-tools]").forEach((el) => {
        el.onclick = () => { if (btnRibbonZero) btnRibbonZero.click(); };
      });
      return;
    }

    // Build contiguous blocks (entangled groups vs standalone qubits)
    const pairGroups = {};
    const blocks = [];
    const visitedPairs = new Set();

    state.activeQubits.forEach((q) => {
      if (q.pair_id) {
        if (!pairGroups[q.pair_id]) pairGroups[q.pair_id] = [];
        pairGroups[q.pair_id].push(q);
      }
    });

    state.activeQubits.forEach((q) => {
      if (q.pair_id && pairGroups[q.pair_id].length > 1) {
        if (!visitedPairs.has(q.pair_id)) {
          visitedPairs.add(q.pair_id);
          blocks.push(pairGroups[q.pair_id].slice());
        }
      } else {
        blocks.push([q]);
      }
    });

    // Pack blocks into a 4-column grid so Bell/GHZ states (N <= 4) never split across rows
    const COLS = 4;
    let col = 0;
    const layoutItems = []; // { qubit, forceRowStart }

    while (blocks.length > 0) {
      const remaining = COLS - col;
      const head = blocks[0];

      if (head.length <= remaining) {
        // Fits on the current row without wrapping
        blocks.shift();
        head.forEach((q) => layoutItems.push({ qubit: q, forceRowStart: false }));
        col = (col + head.length) % COLS;
      } else {
        // Look ahead for a smaller block (e.g. standalone qubit or Bell pair) that fits in the remaining slots of this row
        const fitIdx = blocks.findIndex((b) => b.length <= remaining);
        if (fitIdx !== -1) {
          const fitBlock = blocks.splice(fitIdx, 1)[0];
          fitBlock.forEach((q) => layoutItems.push({ qubit: q, forceRowStart: false }));
          col = (col + fitBlock.length) % COLS;
        } else {
          // Start this entangled group cleanly at Column 1 of the next row
          blocks.shift();
          head.forEach((q, idx) => layoutItems.push({ qubit: q, forceRowStart: idx === 0 }));
          col = head.length % COLS;
        }
      }
    }

    let html = `
      <svg class="entangled-polygons-svg" id="entangled-polygons-svg" aria-hidden="true"></svg>
      <div class="entangled-badges-layer" id="entangled-badges-layer"></div>
    `;

    layoutItems.forEach(({ qubit, forceRowStart }) => {
      html += renderSingleQubitButton(qubit, forceRowStart);
    });

    qubitList.innerHTML = html;

    // Attach click handlers for individual qubits
    qubitList.querySelectorAll("[data-q]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleQubitSelection(el.dataset.q);
      });
    });

    renderEntangledPolygons();
    requestAnimationFrame(() => renderEntangledPolygons());
  }

  function renderSingleQubitButton(q, forceRowStart = false) {
    const orderIdx = state.selectedQubitIds.indexOf(q.id);
    const isSelected = orderIdx !== -1;
    const isEntangled = Boolean(q.pair_id);
    const styleAttr = forceRowStart ? 'style="grid-column-start: 1;"' : "";

    return `
      <button class="inventory-qubit ${isSelected ? 'selected' : ''} ${isEntangled ? 'is-entangled-member' : ''}" data-q="${q.id}" data-pair="${q.pair_id || ''}" ${styleAttr} type="button">
        <div class="qubit-info">
          <small>QUBIT ${String(q.number).padStart(2, '0')}</small>
          <strong>${escapeHtml(q.label || '|ψ⟩')}</strong>
          <span>${escapeHtml(q.creator || 'Local')}</span>
        </div>
        <code>${isSelected ? orderIdx : '+'}</code>
      </button>
    `;
  }

  // ==========================================================================
  // Quantum Channel Transmitter
  // ==========================================================================
  function updateRecipientDropdown() {
    const currentVal = recipientSelect.value;
    recipientSelect.innerHTML = `<option value="">${I18N[state.lang].select_node}</option>`;

    const otherPeers = state.peers.filter((p) => p.sid !== state.mySid);
    otherPeers.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.sid;
      opt.textContent = p.username;
      if (opt.value === currentVal) opt.selected = true;
      recipientSelect.appendChild(opt);
    });

    btnTransmit.disabled = state.selectedQubitIds.length === 0 || !recipientSelect.value;
  }

  recipientSelect.addEventListener("change", () => {
    btnTransmit.disabled = state.selectedQubitIds.length === 0 || !recipientSelect.value;
  });

  btnTransmit.addEventListener("click", () => {
    const targetSid = recipientSelect.value;
    if (!targetSid) {
      showToast(state.lang === "pt" ? "Selecione um nó de destino." : "Select a recipient node.");
      return;
    }
    if (state.selectedQubitIds.length === 0) {
      showToast(state.lang === "pt" ? "Selecione qubits no inventário." : "Select qubits in your inventory.");
      return;
    }

    socket.emit("send_qubit", {
      qubit_ids: state.selectedQubitIds,
      target_sid: targetSid,
    });

    state.selectedQubitIds = [];
    renderQubits();
  });

  // ==========================================================================
  // Classical Register (Bits Inventory)
  // ==========================================================================
  btnClearBits.addEventListener("click", () => {
    socket.emit("clear_measured");
  });

  function renderBits() {
    bitCount.textContent = state.classicalRecords.length;

    if (state.classicalRecords.length === 0) {
      bitsList.innerHTML = `<div class="inline-empty">${I18N[state.lang].no_measurements}</div>`;
      return;
    }

    bitsList.innerHTML = state.classicalRecords
      .map((r) => {
        if (r.type === "single_bit") {
          return `
            <div class="bit-record">
              <span><small>${escapeHtml(r.basis)} BASIS · ${r.timestamp || ''}</small><strong>|${r.value}⟩</strong></span>
              <div><code>q${r.qubit_number}: ${r.value} (${r.eigenstate || ''})</code></div>
            </div>
          `;
        } else if (r.type === "batch_bits") {
          const nested = (r.nested_bits || [])
            .map((b) => `<code>q${b.qubit_number} (${b.basis}): ${b.value} (${b.eigenstate})</code>`)
            .join("");
          return `
            <div class="bit-record batch">
              <span><small>BATCH [${escapeHtml(r.bases)}] · ${r.timestamp || ''}</small><strong>[${r.bitstring}]</strong></span>
              <div class="nested-bits">${nested}</div>
            </div>
          `;
        } else if (r.type === "joint_bell") {
          const nested = (r.nested_bits || [])
            .map((nb) => `<code>q${nb.qubit_number} (${nb.role}): ${nb.value}</code>`)
            .join("");
          return `
            <div class="bit-record bell">
              <span><small>BELL · ${r.timestamp || ''}</small><strong>${escapeHtml(r.bell_state)} (${r.encoded_bits})</strong></span>
              <div class="nested-bits">${nested}</div>
            </div>
          `;
        } else if (r.type === "batch_bell") {
          const nested = (r.nested_joints || [])
            .map((j) => `<div class="nested-joint"><b>${escapeHtml(j.bell_state)} (${j.encoded_bits})</b><span>#${j.qubit_a}-#${j.qubit_b}</span></div>`)
            .join("");
          return `
            <div class="bit-record batch-bell">
              <span><small>BATCH BELL (${r.pairs_count}P) · ${r.timestamp || ''}</small><strong>[${r.bitstring}]</strong></span>
              <div class="nested-joints">${nested}</div>
            </div>
          `;
        }
        return "";
      })
      .join("");
  }

  // ==========================================================================
  // Chat Stream with Public and Private Messages & Filter Tabs
  // ==========================================================================
  function updateChatRecipientDropdown() {
    const currentVal = chatRecipientSelect.value;
    chatRecipientSelect.innerHTML = `<option value="">${I18N[state.lang].chat_dest_public}</option>`;

    const otherPeers = state.peers.filter((p) => p.sid !== state.mySid);
    otherPeers.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.sid;
      opt.textContent = `${p.username} (${state.lang === 'pt' ? 'Privado' : 'Private'})`;
      if (opt.value === currentVal) opt.selected = true;
      chatRecipientSelect.appendChild(opt);
    });
  }

  chatFilterAll.addEventListener("click", () => {
    state.chatFilter = "all";
    chatFilterAll.classList.add("active");
    chatFilterPrivate.classList.remove("active");
    renderMessages();
  });

  chatFilterPrivate.addEventListener("click", () => {
    state.chatFilter = "private";
    chatFilterPrivate.classList.add("active");
    chatFilterAll.classList.remove("active");
    renderMessages();
  });

  if ($("clear-chat")) {
    $("clear-chat").addEventListener("click", () => {
      state.messages = [];
      renderMessages();
    });
  }

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;

    const targetSid = chatRecipientSelect.value;
    const isPrivate = Boolean(targetSid);

    const payload = {
      message: text,
      mode: isPrivate ? "private" : "public",
    };

    if (isPrivate) {
      const selectedOpt = chatRecipientSelect.options[chatRecipientSelect.selectedIndex];
      payload.target_sid = targetSid;
      payload.target_name = selectedOpt ? selectedOpt.textContent.replace(/\s*\(.*\)/, "") : "Peer";
    }

    socket.emit("send_classical_message", payload);
    chatInput.value = "";
  });

  function renderMessages() {
    const filtered = state.messages.filter((m) => {
      if (state.chatFilter === "private") {
        return m.mode === "private";
      }
      return true; // "all" displays both public and private messages
    });

    if (filtered.length === 0) {
      messagesContainer.innerHTML = `<div class="chat-empty">${I18N[state.lang].chat_empty}</div>`;
      return;
    }

    messagesContainer.innerHTML = filtered
      .map((m) => {
        if (m.mode === "system") {
          return `
            <div class="clean-message is-system">
              <div class="system-avatar">SYS</div>
              <span>
                <b>
                  <span class="system-sender">${escapeHtml(m.sender || "SYSTEM")}</span>
                  <small>${m.timestamp || ''}</small>
                </b>
                <p>${escapeHtml(m.message)}</p>
              </span>
            </div>
          `;
        }

        const authorInitial = (m.sender && m.sender[0] ? m.sender[0] : "N").toUpperCase();
        const isPrivate = m.mode === "private";
        let privateBadge = "";

        if (isPrivate) {
          const isSender = m.sid === state.mySid || m.sender === state.username;
          if (isSender) {
            privateBadge = `<span class="private-tag">${state.lang === 'pt' ? 'Para' : 'To'}: ${escapeHtml(m.to || 'Peer')}</span>`;
          } else {
            privateBadge = `<span class="private-tag">${state.lang === 'pt' ? 'Privado de' : 'Private from'}: ${escapeHtml(m.sender)}</span>`;
          }
        }

        return `
          <div class="clean-message ${isPrivate ? 'is-private' : ''}">
            <div>${authorInitial}</div>
            <span>
              <b>
                <span>${escapeHtml(m.sender)} ${privateBadge}</span>
                <small>${m.timestamp || ''}</small>
              </b>
              <p>${escapeHtml(m.message)}</p>
            </span>
          </div>
        `;
      })
      .join("");

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // ==========================================================================
  // Operations Toolbox Handlers
  // ==========================================================================

  // State Preparation
  document.querySelectorAll("[data-prepare]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const stateType = btn.dataset.prepare;
      const count = parseInt($("quantity").value) || 1;
      socket.emit("prepare_state", { state_type: stateType, count: count });
    });
  });

  $("prepare-ghz").addEventListener("click", () => {
    const n = parseInt($("ghz-size").value) || 3;
    socket.emit("prepare_ghz", { n: n });
    closePopovers();
  });

  // Generic State Builder (θ, φ sliders)
  const thetaSlider = $("theta");
  const phaseSlider = $("phase");
  const thetaValue = $("theta-value");
  const phaseValue = $("phase-value");
  const stateEquation = $("state-equation");

  function updateGenericStateEquation() {
    const t = parseFloat(thetaSlider.value);
    const p = parseFloat(phaseSlider.value);
    thetaValue.textContent = t.toFixed(1) + "°";
    phaseValue.textContent = p.toFixed(1) + "°";

    const radT = (t * Math.PI) / 180;
    const radP = (p * Math.PI) / 180;
    const a = Math.cos(radT / 2);
    const b = Math.sin(radT / 2);
    const x = b * Math.cos(radP);
    const y = b * Math.sin(radP);
    const pz0 = a * a * 100;
    const px0 = 0.5 * (1 + Math.sin(radT) * Math.cos(radP)) * 100;
    const py0 = 0.5 * (1 + Math.sin(radT) * Math.sin(radP)) * 100;

    let c1Str = "";
    if (Math.abs(y) < 0.0005) {
      c1Str = x >= 0 ? `+ ${x.toFixed(3)}|1⟩` : `- ${Math.abs(x).toFixed(3)}|1⟩`;
    } else if (Math.abs(x) < 0.0005) {
      c1Str = y >= 0 ? `+ ${y.toFixed(3)}i|1⟩` : `- ${Math.abs(y).toFixed(3)}i|1⟩`;
    } else {
      const sign = y >= 0 ? "+" : "-";
      c1Str = `+ (${x.toFixed(3)} ${sign} ${Math.abs(y).toFixed(3)}i)|1⟩`;
    }

    stateEquation.innerHTML = `
      <b>|ψ⟩ = ${a.toFixed(3)}|0⟩ ${c1Str}</b>
      <span>P<sub>Z</sub>(0)=${pz0.toFixed(1)}% · P<sub>X</sub>(0)=${px0.toFixed(1)}% · P<sub>Y</sub>(0)=${py0.toFixed(1)}%</span>
    `;
  }

  thetaSlider.addEventListener("input", updateGenericStateEquation);
  phaseSlider.addEventListener("input", updateGenericStateEquation);
  updateGenericStateEquation();

  $("prepare-generic").addEventListener("click", () => {
    const t = parseFloat(thetaSlider.value);
    const p = parseFloat(phaseSlider.value);
    const count = parseInt($("quantity").value) || 1;
    socket.emit("prepare_generic_state", { theta: t, phi: p, count: count });
    closePopovers();
  });

  // Quantum Gates
  document.querySelectorAll("[data-gate]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const gate = btn.dataset.gate;
      if (state.selectedQubitIds.length === 0) {
        showToast(state.lang === "pt" ? "Selecione qubits no inventário." : "Select qubits in your inventory.");
        return;
      }

      if (gate === "CX") {
        if (state.selectedQubitIds.length < 2) {
          showToast(state.lang === "pt" ? "CNOT requer controle (0) e pelo menos um alvo (1..N)." : "CNOT requires control (0) and at least one target (1..N).");
          return;
        }
        const cId = state.selectedQubitIds[0];
        const tIds = state.selectedQubitIds.slice(1);
        socket.emit("apply_cnot", { control_id: cId, target_ids: tIds });
        state.selectedQubitIds = [];
        renderQubits();
      } else {
        socket.emit("apply_gate", { qubit_ids: state.selectedQubitIds, gate: gate });
        state.selectedQubitIds = [];
        renderQubits();
      }
    });
  });

  // Pauli String
  $("apply-pauli").addEventListener("click", () => {
    const pStr = $("pauli-string").value.trim();
    if (!pStr) {
      showToast(state.lang === "pt" ? "Digite a Pauli String (ex: XZIY)." : "Enter a Pauli String (e.g. XZIY).");
      return;
    }
    if (state.selectedQubitIds.length === 0) {
      showToast(state.lang === "pt" ? "Selecione qubits no inventário." : "Select qubits in your inventory.");
      return;
    }

    socket.emit("apply_pauli_string", {
      qubit_ids: state.selectedQubitIds,
      pauli_string: pStr,
    });
    state.selectedQubitIds = [];
    closePopovers();
    renderQubits();
  });

  // Measurements
  document.querySelectorAll("[data-measure]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const basis = btn.dataset.measure;
      if (state.selectedQubitIds.length === 0) {
        showToast(state.lang === "pt" ? "Selecione qubits para medir." : "Select qubits to measure.");
        return;
      }

      if (basis === "BELL") {
        if (state.selectedQubitIds.length % 2 !== 0) {
          showToast(state.lang === "pt" ? "Medição Bell requer um número par de qubits." : "Bell measurement requires an even number of qubits.");
          return;
        }
        const pairs = [];
        for (let i = 0; i < state.selectedQubitIds.length; i += 2) {
          pairs.push([state.selectedQubitIds[i], state.selectedQubitIds[i + 1]]);
        }
        socket.emit("measure_batch_bell", { pairs: pairs });
      } else {
        socket.emit("measure_batch", {
          qubit_ids: state.selectedQubitIds,
          bases: basis,
        });
      }

      state.selectedQubitIds = [];
      renderQubits();
    });
  });

  function addLocalLog(type, message) {
    state.logs.unshift({
      type: type,
      message: message,
      timestamp: now(),
    });
    renderLog();
  }

  // Custom Sequence Measurement
  $("measure-custom").addEventListener("click", () => {
    const basesStr = $("basis-string").value.trim();
    if (!basesStr) {
      showToast(state.lang === "pt" ? "Digite a sequência de bases (ex: ZXYZ)." : "Enter basis sequence (e.g. ZXYZ).");
      return;
    }
    if (state.selectedQubitIds.length === 0) {
      showToast(state.lang === "pt" ? "Selecione qubits para medir." : "Select qubits to measure.");
      return;
    }

    socket.emit("measure_batch", {
      qubit_ids: state.selectedQubitIds,
      bases: basesStr,
    });

    state.selectedQubitIds = [];
    closePopovers();
    renderQubits();
  });

  function cryptoRandomBits(n) {
    const bytes = new Uint8Array(n);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => (b & 1).toString()).join("");
  }

  function cryptoRandomBases(n) {
    const bytes = new Uint8Array(n);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => (b & 1 ? "Z" : "X")).join("");
  }

  if ($("btn-random-bases-seq")) {
    $("btn-random-bases-seq").addEventListener("click", () => {
      const n = state.selectedQubitIds.length > 0 ? state.selectedQubitIds.length : 8;
      const bases = cryptoRandomBases(n);
      $("basis-string").value = bases;

      const logMsg = state.lang === "pt"
        ? `Sequência Aleatória de Bases (${n}q) → Bases: ${bases}`
        : `Random Basis Sequence (${n}q) → Bases: ${bases}`;
      addLocalLog("util", logMsg);
      showToast(logMsg);
    });
  }

  // Sampling & Tomography
  $("btn-sample-z").addEventListener("click", () => runSampling("Z"));
  $("btn-sample-x").addEventListener("click", () => runSampling("X"));
  $("btn-sample-y").addEventListener("click", () => runSampling("Y"));
  $("btn-sample-tomo").addEventListener("click", runCompleteTomography);

  function runSampling(basis) {
    if (state.selectedQubitIds.length === 0) {
      showToast(state.lang === "pt" ? "Selecione qubits para amostragem." : "Select qubits to sample.");
      return;
    }
    const shots = parseInt($("sample-shots").value) || 1000;
    socket.emit("sample_state", {
      qubit_ids: state.selectedQubitIds,
      basis: basis,
      shots: shots,
    });
  }

  function runCompleteTomography() {
    if (state.selectedQubitIds.length === 0) {
      showToast(state.lang === "pt" ? "Selecione qubits para tomografia completa." : "Select qubits for complete tomography.");
      return;
    }
    const shots = parseInt($("sample-shots").value) || 1000;
    socket.emit("tomography_sample", {
      qubit_ids: state.selectedQubitIds,
      shots: shots,
    });
  }

  $("btn-close-tomography").addEventListener("click", () => {
    $("tomography-results-container").style.display = "none";
  });

  $("btn-share-histogram").addEventListener("click", () => {
    if (!state.latestTomography) return;
    const tomo = state.latestTomography;
    let summaryText = "";

    if (tomo.z && tomo.x && tomo.y) {
      summaryText = `[${state.lang === 'pt' ? 'Tomografia de Estado Completa' : 'Complete State Tomography'}]\nQubits: ${tomo.qubit_numbers.map((n) => '#' + n).join(', ')}\n• P(${tomo.z_label}): ${tomo.pz0.toFixed(1)}%\n• P(${tomo.x_label}): ${tomo.px0.toFixed(1)}%\n• P(${tomo.y_label}): ${tomo.py0.toFixed(1)}%`;
    } else if (tomo.basis) {
      const topFreqs = Object.entries(tomo.eigenstate_frequencies || {})
        .sort((a, b) => b[1] - a[1])
        .map(([stateLbl, freq]) => `${stateLbl}: ${(freq * 100).toFixed(1)}%`)
        .join(" | ");
      summaryText = `[${state.lang === 'pt' ? 'Amostragem Base' : 'Sampling Basis'} ${tomo.basis}]\nQubits: ${tomo.qubit_numbers.map((n) => '#' + n).join(', ')}\n${topFreqs}`;
    }

    if (summaryText) {
      socket.emit("send_classical_message", { message: summaryText, mode: "public" });
      showToast(state.lang === "pt" ? "Compartilhado no chat da sala!" : "Shared in room chat!");
    }
  });

  function renderSamplingResults(data) {
    const box = $("tomography-results-container");
    const title = $("tomography-title");
    const body = $("tomography-body");

    title.textContent = state.lang === "pt" ? `Amostragem Base ${data.basis} (${data.shots} shots)` : `Sampling Basis ${data.basis} (${data.shots} shots)`;
    const freqs = data.eigenstate_frequencies || {};
    const entries = Object.entries(freqs).sort((a, b) => b[1] - a[1]);

    const barsHtml = entries
      .map(([lbl, p]) => {
        const pct = (p * 100).toFixed(1);
        return `
          <div class="hist-row">
            <span class="hist-label">${escapeHtml(lbl)}</span>
            <div class="hist-bar-track">
              <div class="hist-bar-fill" style="width: ${pct}%"></div>
            </div>
            <span class="hist-val">${pct}%</span>
          </div>
        `;
      })
      .join("");

    body.innerHTML = `<div class="hist-bars">${barsHtml}</div>`;
    box.style.display = "block";
  }

  function renderCompleteTomographyResults(data) {
    const box = $("tomography-results-container");
    const title = $("tomography-title");
    const body = $("tomography-body");

    title.textContent = state.lang === "pt" ? `Tomografia Completa (3 Bases)` : `Complete State Tomography (3 Bases)`;
    body.innerHTML = `
      <div class="tomo-comparison-grid">
        <div class="tomo-card">
          <b>${data.pz0.toFixed(1)}%</b>
          <span>${escapeHtml(data.z_label)}</span>
        </div>
        <div class="tomo-card">
          <b>${data.px0.toFixed(1)}%</b>
          <span>${escapeHtml(data.x_label)}</span>
        </div>
        <div class="tomo-card">
          <b>${data.py0.toFixed(1)}%</b>
          <span>${escapeHtml(data.y_label)}</span>
        </div>
      </div>
    `;
    box.style.display = "block";
  }

  // Protocols (Space-insensitive, unspaced by default, and registered in the Operation Log)
  $("encode-bb84").addEventListener("click", () => {
    const bits = $("bb84-bits").value.replace(/\s+/g, "");
    const bases = $("bb84-bases").value.replace(/\s+/g, "").toUpperCase();
    if (!bits || !bases) {
      showToast(state.lang === "pt" ? "Preencha bits e bases." : "Fill in bits and bases.");
      return;
    }
    socket.emit("batch_encode", { bits: bits, bases: bases });
  });

  $("compare-bases").addEventListener("click", () => {
    const a = $("bases-a").value.replace(/[\s,\[\]]+/g, "").toUpperCase().split("");
    const b = $("bases-b").value.replace(/[\s,\[\]]+/g, "").toUpperCase().split("");
    const minLen = Math.min(a.length, b.length);
    const matched = [];
    for (let i = 0; i < minLen; i++) {
      if (a[i] === b[i]) matched.push(i);
    }
    const resText = state.lang === "pt"
      ? `Índices compatíveis (${matched.length}): ${matched.join(", ")}`
      : `Matching indices (${matched.length}): ${matched.join(", ")}`;
    $("tool-result").textContent = resText;

    addLocalLog(
      "util",
      state.lang === "pt"
        ? `Comparador de Bases (A: ${a.join("")} | B: ${b.join("")}) → ${resText}`
        : `Basis Comparison (A: ${a.join("")} | B: ${b.join("")}) → ${resText}`
    );
  });

  $("extract-key").addEventListener("click", () => {
    const indicesStr = $("key-indices").value.trim();
    const rawOutcomes = $("raw-bits").value.replace(/[\s,\[\]]+/g, "").split("");
    const indices = (/[\s,]/.test(indicesStr) ? indicesStr.split(/[\s,]+/) : indicesStr.split(""))
      .map(Number)
      .filter((n) => !isNaN(n));

    const key = indices
      .map((i) => {
        const val = rawOutcomes[i];
        if (val === "+" || val === "0") return "0";
        if (val === "-" || val === "1") return "1";
        return val;
      })
      .filter((v) => v !== undefined && v !== null && v !== "")
      .join("");

    const resText = state.lang === "pt"
      ? `Chave Final Filtrada: [${key}] (${key.length} bits)`
      : `Sifted Secret Key: [${key}] (${key.length} bits)`;
    $("tool-result").textContent = resText;

    addLocalLog(
      "util",
      state.lang === "pt"
        ? `Extrator de Chave (Índices: ${indices.join(", ")}) → [${key}] (${key.length} bits)`
        : `Sifted Key Extractor (Indices: ${indices.join(", ")}) → [${key}] (${key.length} bits)`
    );
  });

  $("generate-random").addEventListener("click", () => {
    const n = Math.max(1, Math.min(64, parseInt($("random-size").value) || 8));
    const bits = cryptoRandomBits(n);
    const bases = cryptoRandomBases(n);
    $("tool-result").textContent = `Bits: ${bits}\nBases: ${bases}`;

    $("bb84-bits").value = bits;
    $("bb84-bases").value = bases;

    addLocalLog(
      "util",
      state.lang === "pt"
        ? `Gerador Aleatório (${n} bits) → Bits: ${bits} | Bases: ${bases}`
        : `Random Generator (${n} bits) → Bits: ${bits} | Bases: ${bases}`
    );
  });

  // D.E. (Distribuidor de Emaranhamento)
  function updateParticipantList() {
    participantList.innerHTML = "";

    const selfLabel = document.createElement("label");
    selfLabel.innerHTML = `
      <input type="checkbox" value="${state.mySid}" checked disabled>
      <span><i>Y</i>${escapeHtml(state.username || 'You')} (${I18N[state.lang].you_label})</span>
    `;
    participantList.appendChild(selfLabel);

    const otherPeers = state.peers.filter((p) => p.sid !== state.mySid);
    if (otherPeers.length === 0) {
      const emptyNote = document.createElement("div");
      emptyNote.className = "inline-empty";
      emptyNote.style.gridColumn = "1 / -1";
      emptyNote.textContent = I18N[state.lang].waiting_peers;
      participantList.appendChild(emptyNote);
      return;
    }

    otherPeers.forEach((p) => {
      const lbl = document.createElement("label");
      const initial = (p.username[0] || "P").toUpperCase();
      lbl.innerHTML = `
        <input type="checkbox" value="${p.sid}">
        <span><i>${initial}</i>${escapeHtml(p.username)}</span>
      `;
      participantList.appendChild(lbl);
    });
  }

  btnDistributeEntanglement.addEventListener("click", () => {
    const checkedInputs = participantList.querySelectorAll("input[type=checkbox]:checked");
    const recipientSids = Array.from(checkedInputs).map((input) => input.value);

    if (recipientSids.length < 2) {
      showToast(state.lang === "pt" ? "Selecione pelo menos 2 participantes." : "Select at least 2 participants for distribution.");
      return;
    }

    socket.emit("distribute_entanglement", { recipient_sids: recipientSids });
    closePopovers();
  });

  // Private Log
  btnClearLog.addEventListener("click", () => {
    state.logs = [];
    renderLog();
  });

  function renderLog() {
    if (state.logs.length === 0) {
      operationLog.innerHTML = `<div class="inline-empty">${I18N[state.lang].no_operations}</div>`;
      return;
    }

    operationLog.innerHTML = state.logs
      .map((item) => {
        let code = "OP";
        if (item.type === "prepare") code = "S";
        else if (item.type === "gate") code = "G";
        else if (item.type === "transmit") code = "Tx";
        else if (item.type === "measure") code = "M";
        else if (item.type === "sample") code = "Sm";
        else if (item.type === "util") code = "Ut";
        else if (item.type === "system") code = "Sys";

        return `
          <div class="log-item">
            <b>${code}</b>
            <span>
              <strong>${escapeHtml(item.message)}</strong>
              <small>${item.timestamp || now()}</small>
            </span>
          </div>
        `;
      })
      .join("");
  }

  // ==========================================================================
  // Language & Theme Handlers
  // ==========================================================================
  langToggle.addEventListener("click", () => {
    const nextLang = state.lang === "en" ? "pt" : "en";
    setLanguage(nextLang);
  });

  function applyTheme(isLight) {
    if (isLight) {
      document.documentElement.classList.add("light-theme");
      themeIcon.textContent = "☾";
    } else {
      document.documentElement.classList.remove("light-theme");
      themeIcon.textContent = "☼";
    }
    localStorage.setItem("bell_theme", isLight ? "light" : "dark");
  }

  themeToggle.addEventListener("click", () => {
    const isLight = !document.documentElement.classList.contains("light-theme");
    applyTheme(isLight);
  });

  if (localStorage.getItem("bell_theme") === "light") {
    applyTheme(true);
  }

  // Set initial language (Default: English)
  setLanguage(state.lang);
});
