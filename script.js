const welcomeView = document.getElementById('welcome-view');
const conversationView = document.getElementById('conversation-view');
const createRoomButton = document.getElementById('create-room');
const joinRoomButton = document.getElementById('join-room');
const roomCodeInput = document.getElementById('room-code');
const entryMessage = document.getElementById('entry-message');
const messages = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-message');
const toast = document.getElementById('toast');

let peer = null;
let connection = null;
let localStream = null;
let activeCall = null;
let incomingCall = null;
let toastTimer = null;
let displayName = 'You';

function peerOptions() {
  return {
    host: window.location.hostname,
    port: window.location.port ? Number(window.location.port) : (window.location.protocol === 'https:' ? 443 : 80),
    path: '/peerjs',
    secure: window.location.protocol === 'https:'
  };
}

function showEntryMessage(message, isError = true) {
  entryMessage.textContent = message;
  entryMessage.classList.toggle('is-error', isError);
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2800);
}

function setBusy(isBusy) {
  createRoomButton.disabled = isBusy;
  joinRoomButton.disabled = isBusy;
  createRoomButton.classList.toggle('is-loading', isBusy);
}

function generateRoomCode() {
  const values = new Uint32Array(1);
  window.crypto.getRandomValues(values);
  return String(100000 + (values[0] % 900000));
}

function openPeer(id) {
  return new Promise((resolve, reject) => {
    if (typeof Peer === 'undefined') {
      reject(new Error('PeerJS could not be loaded. Check your internet connection and try again.'));
      return;
    }

    const newPeer = new Peer(id, peerOptions());
    peer = newPeer;
    let opened = false;

    newPeer.on('open', () => {
      opened = true;
      resolve(newPeer);
    });

    newPeer.on('error', error => {
      if (!opened) {
        reject(error);
        return;
      }
      showToast(peerErrorMessage(error));
    });

    newPeer.on('disconnected', () => {
      setConnectionStatus('Reconnecting…', false);
      newPeer.reconnect();
    });

    newPeer.on('close', () => {
      if (peer === newPeer) peer = null;
    });
  });
}

function peerErrorMessage(error) {
  if (error.type === 'network' || error.type === 'socket-error' || error.type === 'socket-closed') {
    return 'The connection to the room server was interrupted.';
  }
  if (error.type === 'unavailable-id' || error.type === 'id-taken') {
    return 'That room code is already in use. Please start a new room.';
  }
  return error.message || 'Something interrupted the connection. Please try again.';
}

function updateIdentity() {
  const initial = displayName.trim().charAt(0).toUpperCase() || 'Y';
  document.getElementById('your-name').textContent = displayName;
  document.getElementById('your-avatar').textContent = initial;
  document.getElementById('remote-video-name').textContent = document.getElementById('them-name').textContent;
}

function showConversation(code) {
  document.getElementById('display-room-code').textContent = code;
  welcomeView.classList.add('is-hidden');
  conversationView.classList.remove('is-hidden');
  updateIdentity();
}

function setConnectionStatus(text, isConnected) {
  document.getElementById('connection-status').textContent = text;
  document.getElementById('status-dot').classList.toggle('is-connected', isConnected);
}

function setConnected(remoteDisplayName) {
  const name = remoteDisplayName && remoteDisplayName.trim() ? remoteDisplayName.trim().slice(0, 24) : '';
  const otherName = name && name !== displayName ? name : 'Your person';
  document.getElementById('them-name').textContent = otherName;
  document.getElementById('them-avatar').textContent = otherName.charAt(0).toUpperCase();
  document.getElementById('them-indicator').classList.add('is-connected');
  document.getElementById('chat-title').textContent = `You & ${otherName}`;
  document.getElementById('remote-video-name').textContent = otherName;
  setConnectionStatus('Here with you', true);
  messageInput.disabled = false;
  sendButton.disabled = false;
  document.getElementById('start-call').disabled = false;
}

function setDisconnected() {
  document.getElementById('them-name').textContent = 'They left the room';
  document.getElementById('them-indicator').classList.remove('is-connected');
  setConnectionStatus('Conversation ended', false);
  messageInput.disabled = true;
  sendButton.disabled = true;
  document.getElementById('start-call').disabled = true;
}

function attachConnection(dataConnection) {
  if (connection && connection !== dataConnection && connection.open) {
    dataConnection.close();
    return;
  }

  connection = dataConnection;
  dataConnection.on('open', () => {
    setConnected(dataConnection.metadata && dataConnection.metadata.name);
  });
  dataConnection.on('data', data => {
    if (data && typeof data === 'object' && data.type === 'message' && typeof data.text === 'string') {
      appendMessage(data.text, false, data.sentAt);
    }
  });
  dataConnection.on('close', () => {
    if (connection !== dataConnection) return;
    connection = null;
    setDisconnected();
    if (activeCall) finishCall(false);
  });
  dataConnection.on('error', error => {
    showToast(error.message || 'Your message could not be delivered.');
  });
}

function appendMessage(text, isMine, sentAt = Date.now()) {
  const waitingNote = document.getElementById('waiting-note');
  if (waitingNote) waitingNote.remove();

  const message = document.createElement('article');
  message.className = `message ${isMine ? 'message-mine' : 'message-theirs'}`;

  if (!isMine) {
    const name = document.createElement('span');
    name.className = 'message-author';
    name.textContent = document.getElementById('them-name').textContent;
    message.append(name);
  }

  const bubble = document.createElement('p');
  bubble.className = 'message-bubble';
  bubble.textContent = text;
  message.append(bubble);

  const time = document.createElement('time');
  time.className = 'message-time';
  const date = new Date(sentAt);
  time.dateTime = date.toISOString();
  time.textContent = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  message.append(time);

  messages.append(message);
  messages.scrollTop = messages.scrollHeight;
}

async function createRoom() {
  setBusy(true);
  showEntryMessage('');
  displayName = document.getElementById('display-name').value.trim() || 'You';
  displayName = displayName.slice(0, 24);
  const code = generateRoomCode();
  showEntryMessage('Making a little room for you…', false);

  try {
    await openPeer(`kindred-${code}`);
    showConversation(code);
    setConnectionStatus('Waiting for your person', false);
    if (peer) {
      peer.on('connection', attachConnection);
      peer.on('call', handleIncomingCall);
    }
    showToast('Room ready. Send your code to your person.');
  } catch (error) {
    if (peer) peer.destroy();
    peer = null;
    showEntryMessage(peerErrorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function joinRoom() {
  const code = roomCodeInput.value.trim();
  if (!/^\d{6}$/.test(code)) {
    showEntryMessage('Enter all six digits to join a room.');
    roomCodeInput.focus();
    return;
  }

  setBusy(true);
  showEntryMessage('Finding your person…', false);
  displayName = document.getElementById('display-name').value.trim() || 'You';
  displayName = displayName.slice(0, 24);

  try {
    await openPeer();
    if (!peer) throw new Error('Could not open your connection. Please try again.');
    peer.on('call', handleIncomingCall);
    const dataConnection = peer.connect(`kindred-${code}`, {
      reliable: true,
      metadata: { name: displayName }
    });
    attachConnection(dataConnection);
    dataConnection.on('open', () => {
      showConversation(code);
    });
    dataConnection.on('error', error => {
      showEntryMessage(error.type === 'peer-unavailable'
        ? 'We couldn’t find that room. Check the code and try again.'
        : peerErrorMessage(error));
      if (peer) peer.destroy();
      peer = null;
      connection = null;
      setBusy(false);
    });
    dataConnection.on('close', () => {
      if (welcomeView.classList.contains('is-hidden')) return;
      if (peer) peer.destroy();
      peer = null;
      connection = null;
      setBusy(false);
      showEntryMessage('That room closed before you could join. Check with your person and try again.');
    });
  } catch (error) {
    if (peer) peer.destroy();
    peer = null;
    setBusy(false);
    showEntryMessage(peerErrorMessage(error));
  }
}

function sendMessage(event) {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !connection || !connection.open) return;

  const sentAt = Date.now();
  try {
    connection.send({ type: 'message', text, sentAt });
    appendMessage(text, true, sentAt);
    messageInput.value = '';
    messageInput.focus();
  } catch (error) {
    showToast(error.message || 'Your message could not be sent.');
  }
}

async function getMediaStream() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Video calling needs a secure connection and a browser with camera support.');
  }
  return navigator.mediaDevices.getUserMedia({ video: true, audio: true });
}

async function startCall() {
  if (!connection || !connection.open || !peer || activeCall) return;
  document.getElementById('call-status').textContent = 'Getting your camera ready…';
  try {
    localStream = await getMediaStream();
    document.getElementById('local-video').srcObject = localStream;
    document.getElementById('call-overlay').classList.remove('is-hidden');
    activeCall = peer.call(connection.peer, localStream);
    if (!activeCall) throw new Error('The video call could not be started.');
    bindCall(activeCall);
  } catch (error) {
    stopLocalStream();
    document.getElementById('call-overlay').classList.add('is-hidden');
    showToast(error.name === 'NotAllowedError'
      ? 'Allow camera and microphone access to start a video call.'
      : (error.message || 'Could not start the video call.'));
  }
}

function handleIncomingCall(call) {
  if (activeCall || incomingCall) {
    call.close();
    return;
  }
  incomingCall = call;
  document.getElementById('incoming-call').classList.remove('is-hidden');
}

async function answerCall() {
  if (!incomingCall) return;
  const call = incomingCall;
  incomingCall = null;
  document.getElementById('incoming-call').classList.add('is-hidden');
  try {
    localStream = await getMediaStream();
    document.getElementById('local-video').srcObject = localStream;
    document.getElementById('call-overlay').classList.remove('is-hidden');
    activeCall = call;
    call.answer(localStream);
    bindCall(call);
  } catch (error) {
    call.close();
    stopLocalStream();
    showToast(error.name === 'NotAllowedError'
      ? 'Allow camera and microphone access to answer the call.'
      : (error.message || 'Could not answer the video call.'));
  }
}

function bindCall(call) {
  call.on('stream', remoteStream => {
    document.getElementById('remote-video').srcObject = remoteStream;
    document.getElementById('remote-placeholder').classList.add('is-hidden');
    document.getElementById('call-status').textContent = 'You’re together now';
  });
  call.on('close', () => finishCall(false));
  call.on('error', error => {
    showToast(error.message || 'The video call was interrupted.');
    finishCall(false);
  });
}

function stopLocalStream() {
  if (localStream) localStream.getTracks().forEach(track => track.stop());
  localStream = null;
  document.getElementById('local-video').srcObject = null;
}

function finishCall(closePeerCall = true) {
  const call = activeCall;
  activeCall = null;
  if (closePeerCall && call) call.close();
  if (incomingCall) incomingCall.close();
  incomingCall = null;
  stopLocalStream();
  document.getElementById('remote-video').srcObject = null;
  document.getElementById('remote-placeholder').classList.remove('is-hidden');
  document.getElementById('call-overlay').classList.add('is-hidden');
  document.getElementById('incoming-call').classList.add('is-hidden');
  document.getElementById('call-status').textContent = 'Connecting your call…';
  document.getElementById('toggle-mic').classList.remove('is-off');
  document.getElementById('toggle-camera').classList.remove('is-off');
}

async function leaveRoom() {
  finishCall();
  if (connection) connection.close();
  if (peer) peer.destroy();
  peer = null;
  connection = null;
  messages.replaceChildren();
  welcomeView.classList.remove('is-hidden');
  conversationView.classList.add('is-hidden');
  roomCodeInput.value = '';
  showEntryMessage('');
  setBusy(false);
}

async function copyRoomCode() {
  const code = document.getElementById('display-room-code').textContent;
  try {
    await navigator.clipboard.writeText(code);
    showToast('Room code copied. Go find your person.');
  } catch {
    showToast(`Your room code is ${code}`);
  }
}

function toggleTrack(trackType, buttonId, onLabel, offLabel) {
  if (!localStream) return;
  const tracks = trackType === 'audio' ? localStream.getAudioTracks() : localStream.getVideoTracks();
  if (!tracks.length) return;
  const enabled = !tracks[0].enabled;
  tracks.forEach(track => { track.enabled = enabled; });
  const button = document.getElementById(buttonId);
  button.classList.toggle('is-off', !enabled);
  button.setAttribute('aria-label', enabled ? onLabel : offLabel);
}

createRoomButton.addEventListener('click', createRoom);
joinRoomButton.addEventListener('click', joinRoom);
document.getElementById('message-form').addEventListener('submit', sendMessage);
document.getElementById('copy-code').addEventListener('click', copyRoomCode);
document.getElementById('leave-room').addEventListener('click', leaveRoom);
document.getElementById('start-call').addEventListener('click', startCall);
document.getElementById('end-call').addEventListener('click', () => finishCall());
document.getElementById('hangup').addEventListener('click', () => finishCall());
document.getElementById('accept-call').addEventListener('click', answerCall);
document.getElementById('decline-call').addEventListener('click', () => {
  if (incomingCall) incomingCall.close();
  incomingCall = null;
  document.getElementById('incoming-call').classList.add('is-hidden');
});
document.getElementById('toggle-mic').addEventListener('click', () => {
  toggleTrack('audio', 'toggle-mic', 'Mute microphone', 'Unmute microphone');
});
document.getElementById('toggle-camera').addEventListener('click', () => {
  toggleTrack('video', 'toggle-camera', 'Turn camera off', 'Turn camera on');
});
roomCodeInput.addEventListener('input', () => {
  roomCodeInput.value = roomCodeInput.value.replace(/\D/g, '').slice(0, 6);
  if (entryMessage.classList.contains('is-error')) showEntryMessage('');
});
roomCodeInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') joinRoom();
});
