const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

let rooms = {}; // roomCode -> { players: { p1: ws, p2: ws }, state: {...} }

function generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

console.log('Gravity Brawl WebSocket Server listening on ws://localhost:8080');

wss.on('connection', (ws) => {
    let currentRoom = null;
    let playerRole = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case 'CREATE_ROOM': {
                    const roomCode = generateRoomCode();
                    rooms[roomCode] = {
                        players: { p1: ws, p2: null },
                        status: 'waiting'
                    };
                    currentRoom = roomCode;
                    playerRole = 'p1';
                    ws.send(JSON.stringify({ type: 'ROOM_CREATED', roomCode, playerRole: 'p1' }));
                    console.log(`Room ${roomCode} created by Player 1`);
                    break;
                }

                case 'JOIN_ROOM': {
                    const roomCode = data.roomCode;
                    if (rooms[roomCode] && !rooms[roomCode].players.p2) {
                        rooms[roomCode].players.p2 = ws;
                        rooms[roomCode].status = 'playing';
                        currentRoom = roomCode;
                        playerRole = 'p2';

                        ws.send(JSON.stringify({ type: 'ROOM_JOINED', roomCode, playerRole: 'p2' }));
                        
                        // Notify both players that match is starting
                        const startData = JSON.stringify({ type: 'GAME_START', roomCode });
                        rooms[roomCode].players.p1.send(startData);
                        rooms[roomCode].players.p2.send(startData);
                        console.log(`Player 2 joined room ${roomCode}. Game starting.`);
                    } else {
                        ws.send(JSON.stringify({ type: 'ERROR', message: '방이 존재하지 않거나 이미 가득 차 있습니다.' }));
                    }
                    break;
                }

                case 'GAME_STATE': {
                    // Relay player position, velocity, and gravity actions to the other player
                    if (currentRoom && rooms[currentRoom]) {
                        const room = rooms[currentRoom];
                        const opponent = playerRole === 'p1' ? room.players.p2 : room.players.p1;
                        if (opponent && opponent.readyState === WebSocket.OPEN) {
                            opponent.send(JSON.stringify({
                                type: 'OPPONENT_STATE',
                                state: data.state
                            }));
                        }
                    }
                    break;
                }

                case 'SCORE_UPDATE': {
                    if (currentRoom && rooms[currentRoom]) {
                        const room = rooms[currentRoom];
                        const broadcastData = JSON.stringify({
                            type: 'SCORE_UPDATE',
                            scores: data.scores,
                            winner: data.winner
                        });
                        if (room.players.p1) room.players.p1.send(broadcastData);
                        if (room.players.p2) room.players.p2.send(broadcastData);
                    }
                    break;
                }
            }
        } catch (err) {
            console.error('Error handling message:', err);
        }
    });

    ws.on('close', () => {
        if (currentRoom && rooms[currentRoom]) {
            const room = rooms[currentRoom];
            const opponent = playerRole === 'p1' ? room.players.p2 : room.players.p1;
            if (opponent && opponent.readyState === WebSocket.OPEN) {
                opponent.send(JSON.stringify({ type: 'OPPONENT_DISCONNECTED' }));
            }
            delete rooms[currentRoom];
            console.log(`Room ${currentRoom} closed due to disconnection.`);
        }
    });
});
