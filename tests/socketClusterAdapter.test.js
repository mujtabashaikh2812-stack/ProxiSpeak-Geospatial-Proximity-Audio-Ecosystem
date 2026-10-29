'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { SocketClusterAdapter, CLUSTER_CHANNELS } = require('../services/socketClusterAdapter');
const { InMemoryRedisMock } = require('../services/redisClient');

/**
 * Creates a mock Socket.io Server instance for test assertions
 */
function createMockSocketServer() {
  const io = new EventEmitter();
  const roomEmitters = new Map();

  io.to = (targetId) => {
    if (!roomEmitters.has(targetId)) {
      roomEmitters.set(targetId, new EventEmitter());
    }
    return roomEmitters.get(targetId);
  };

  io._getRoomEmitter = (targetId) => {
    if (!roomEmitters.has(targetId)) {
      roomEmitters.set(targetId, new EventEmitter());
    }
    return roomEmitters.get(targetId);
  };

  return io;
}

test('SocketClusterAdapter: initialization and instanceId generation', async () => {
  InMemoryRedisMock.resetBus();
  const mockIo = createMockSocketServer();
  const pubClient = new InMemoryRedisMock('pub-init');
  const subClient = new InMemoryRedisMock('sub-init');

  const adapter = new SocketClusterAdapter(mockIo, {
    instanceId: 'test-node-1',
    pubClient,
    subClient,
    heartbeatIntervalMs: 0, // Disabled in test
  });

  await adapter.init();
  assert.equal(adapter.instanceId, 'test-node-1');
  assert.equal(adapter.isInitialized, true);

  const status = adapter.getClusterStatus();
  assert.equal(status.instanceId, 'test-node-1');
  assert.equal(status.isClusterActive, true);
  assert.equal(status.pubSubMode, 'in_memory_resilient');

  await adapter.close();
});

test('SocketClusterAdapter: cross-instance broadcast and loopback suppression', async () => {
  InMemoryRedisMock.resetBus();
  const mockIoA = createMockSocketServer();
  const mockIoB = createMockSocketServer();

  const pubA = new InMemoryRedisMock('pub-A');
  const subA = new InMemoryRedisMock('sub-A');
  const pubB = new InMemoryRedisMock('pub-B');
  const subB = new InMemoryRedisMock('sub-B');

  const nodeA = new SocketClusterAdapter(mockIoA, {
    instanceId: 'node-A',
    pubClient: pubA,
    subClient: subA,
    heartbeatIntervalMs: 0,
  });

  const nodeB = new SocketClusterAdapter(mockIoB, {
    instanceId: 'node-B',
    pubClient: pubB,
    subClient: subB,
    heartbeatIntervalMs: 0,
  });

  await nodeA.init();
  await nodeB.init();

  let nodeARelayed = false;
  let nodeBReceivedPayload = null;

  mockIoA.on('player:moved', () => {
    nodeARelayed = true; // Should NOT happen (loopback suppressed)
  });

  mockIoB.on('player:moved', (data) => {
    nodeBReceivedPayload = data;
  });

  // Node A broadcasts movement of a player connected to Node A
  await nodeA.broadcast('player:moved', {
    userId: 'user-a1',
    displayName: 'Alice',
    canvasX: 250,
    canvasY: 300,
  });

  // Verification
  assert.equal(nodeARelayed, false, 'Node A must suppress its own broadcast loopback');
  assert.notEqual(nodeBReceivedPayload, null, 'Node B must receive the broadcast');
  assert.equal(nodeBReceivedPayload.userId, 'user-a1');
  assert.equal(nodeBReceivedPayload.canvasX, 250);

  // Check remote users registry on Node B
  const remoteUserOnB = nodeB.getUser('user-a1');
  assert.notEqual(remoteUserOnB, null);
  assert.equal(remoteUserOnB.isRemote, true);
  assert.equal(remoteUserOnB.instanceId, 'node-A');

  await nodeA.close();
  await nodeB.close();
});

test('SocketClusterAdapter: cross-instance proximity evaluation between local and remote users', async () => {
  InMemoryRedisMock.resetBus();
  const mockIoA = createMockSocketServer();
  const mockIoB = createMockSocketServer();

  // Local user on Node A: "local-alice" at (100, 100)
  const localUsersA = new Map([
    [
      'sock-alice',
      {
        socketId: 'sock-alice',
        userId: 'local-alice',
        displayName: 'Alice',
        canvasX: 100,
        canvasY: 100,
        zone: 'open_workspace',
      },
    ],
  ]);
  const userToSocketA = new Map([['local-alice', 'sock-alice']]);

  const nodeA = new SocketClusterAdapter(mockIoA, {
    instanceId: 'node-A',
    pubClient: new InMemoryRedisMock('pub-A2'),
    subClient: new InMemoryRedisMock('sub-A2'),
    localUsers: localUsersA,
    localUserToSocket: userToSocketA,
    heartbeatIntervalMs: 0,
  });

  const nodeB = new SocketClusterAdapter(mockIoB, {
    instanceId: 'node-B',
    pubClient: new InMemoryRedisMock('pub-B2'),
    subClient: new InMemoryRedisMock('sub-B2'),
    heartbeatIntervalMs: 0,
  });

  await nodeA.init();
  await nodeB.init();

  const aliceEmitter = mockIoA._getRoomEmitter('sock-alice');
  let proximityEvents = [];

  aliceEmitter.on('proximity:enter', (e) => proximityEvents.push({ type: 'enter', ...e }));
  aliceEmitter.on('proximity:update', (e) => proximityEvents.push({ type: 'update', ...e }));
  aliceEmitter.on('proximity:leave', (e) => proximityEvents.push({ type: 'leave', ...e }));

  // Step 1: Remote peer Bob joins on Node B at (120, 100) -> distance is 20px (within earshot 100px)
  await nodeB.broadcast('user:joined', {
    socketId: 'sock-bob',
    userId: 'remote-bob',
    displayName: 'Bob',
    canvasX: 120,
    canvasY: 100,
    zone: 'open_workspace',
  });

  assert.equal(proximityEvents.length, 1);
  assert.equal(proximityEvents[0].type, 'enter');
  assert.equal(proximityEvents[0].peerId, 'remote-bob');
  assert.equal(proximityEvents[0].distance, 20);
  assert.equal(proximityEvents[0].isRemote, true);

  // Step 2: Bob moves to (160, 100) -> distance is 60px (still within earshot)
  await nodeB.broadcast('player:moved', {
    userId: 'remote-bob',
    canvasX: 160,
    canvasY: 100,
    zone: 'open_workspace',
  });

  assert.equal(proximityEvents.length, 2);
  assert.equal(proximityEvents[1].type, 'update');
  assert.equal(proximityEvents[1].distance, 60);

  // Step 3: Bob walks away to (400, 400) -> distance is ~424px (leaves earshot)
  await nodeB.broadcast('player:moved', {
    userId: 'remote-bob',
    canvasX: 400,
    canvasY: 400,
    zone: 'open_workspace',
  });

  assert.equal(proximityEvents.length, 3);
  assert.equal(proximityEvents[2].type, 'leave');
  assert.equal(proximityEvents[2].peerId, 'remote-bob');

  await nodeA.close();
  await nodeB.close();
});

test('SocketClusterAdapter: cross-instance WebRTC unicast signaling relay', async () => {
  InMemoryRedisMock.resetBus();
  const mockIoA = createMockSocketServer();
  const mockIoB = createMockSocketServer();

  // Charlie is connected locally to Node A
  const localUsersA = new Map([
    [
      'sock-charlie',
      {
        socketId: 'sock-charlie',
        userId: 'charlie',
        displayName: 'Charlie',
        canvasX: 100,
        canvasY: 100,
      },
    ],
  ]);
  const userToSocketA = new Map([['charlie', 'sock-charlie']]);

  const nodeA = new SocketClusterAdapter(mockIoA, {
    instanceId: 'node-A3',
    pubClient: new InMemoryRedisMock('pub-A3'),
    subClient: new InMemoryRedisMock('sub-A3'),
    localUsers: localUsersA,
    localUserToSocket: userToSocketA,
    heartbeatIntervalMs: 0,
  });

  const nodeB = new SocketClusterAdapter(mockIoB, {
    instanceId: 'node-B3',
    pubClient: new InMemoryRedisMock('pub-B3'),
    subClient: new InMemoryRedisMock('sub-B3'),
    heartbeatIntervalMs: 0,
  });

  await nodeA.init();
  await nodeB.init();

  const charlieEmitter = mockIoA._getRoomEmitter('sock-charlie');
  let receivedSignal = null;

  charlieEmitter.on('webrtc:offer', (payload) => {
    receivedSignal = payload;
  });

  // Node B forwards an SDP offer targeted specifically to 'charlie'
  await nodeB.unicast('charlie', 'webrtc:offer', {
    from: 'remote-dan',
    fromSocketId: 'sock-dan',
    sdp: { type: 'offer', sdp: 'mock-sdp-data' },
    distance: 45,
    mode: 'PROXIMITY_3D',
  });

  assert.notEqual(receivedSignal, null);
  assert.equal(receivedSignal.from, 'remote-dan');
  assert.equal(receivedSignal.sdp.type, 'offer');
  assert.equal(receivedSignal.distance, 45);

  assert.equal(nodeA.metrics.unicastsRouted, 1);

  await nodeA.close();
  await nodeB.close();
});

test('SocketClusterAdapter: remote peer disconnect cleans up registry and proximity', async () => {
  InMemoryRedisMock.resetBus();
  const mockIoA = createMockSocketServer();
  const localUsersA = new Map([
    [
      'sock-alice',
      {
        socketId: 'sock-alice',
        userId: 'alice',
        displayName: 'Alice',
        canvasX: 100,
        canvasY: 100,
      },
    ],
  ]);

  const nodeA = new SocketClusterAdapter(mockIoA, {
    instanceId: 'node-A4',
    pubClient: new InMemoryRedisMock('pub-A4'),
    subClient: new InMemoryRedisMock('sub-A4'),
    localUsers: localUsersA,
    localUserToSocket: new Map([['alice', 'sock-alice']]),
    heartbeatIntervalMs: 0,
  });

  const nodeB = new SocketClusterAdapter(createMockSocketServer(), {
    instanceId: 'node-B4',
    pubClient: new InMemoryRedisMock('pub-B4'),
    subClient: new InMemoryRedisMock('sub-B4'),
    heartbeatIntervalMs: 0,
  });

  await nodeA.init();
  await nodeB.init();

  const aliceEmitter = mockIoA._getRoomEmitter('sock-alice');
  let leftEvent = null;

  aliceEmitter.on('proximity:leave', (e) => {
    leftEvent = e;
  });

  // Bob joins in range
  await nodeB.broadcast('user:joined', {
    socketId: 'sock-bob',
    userId: 'bob',
    displayName: 'Bob',
    canvasX: 110,
    canvasY: 100,
  });

  assert.equal(nodeA.remoteUsers.has('bob'), true);

  // Bob disconnects from Node B
  await nodeB.broadcast('user:left', {
    userId: 'bob',
    reason: 'client_disconnect',
  });

  // Node A should remove Bob and send leave transition
  assert.equal(nodeA.remoteUsers.has('bob'), false);
  assert.notEqual(leftEvent, null);
  assert.equal(leftEvent.peerId, 'bob');
  assert.equal(leftEvent.reason, 'remote_peer_disconnected');

  await nodeA.close();
  await nodeB.close();
});

test('SocketClusterAdapter: getAllClusterUsers aggregates local and remote peers', async () => {
  InMemoryRedisMock.resetBus();
  const localUsers = new Map([
    ['sock-1', { socketId: 'sock-1', userId: 'user-1', displayName: 'User 1' }],
  ]);

  const adapter = new SocketClusterAdapter(createMockSocketServer(), {
    instanceId: 'node-agg',
    pubClient: new InMemoryRedisMock('pub-agg'),
    subClient: new InMemoryRedisMock('sub-agg'),
    localUsers,
    heartbeatIntervalMs: 0,
  });

  await adapter.init();
  adapter.remoteUsers.set('user-2', {
    userId: 'user-2',
    displayName: 'User 2',
    isRemote: true,
  });

  const all = adapter.getAllClusterUsers();
  assert.equal(all.length, 2);
  const user1 = all.find((u) => u.userId === 'user-1');
  const user2 = all.find((u) => u.userId === 'user-2');
  assert.equal(user1.isRemote, false);
  assert.equal(user2.isRemote, true);

  await adapter.close();
});
