const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

// Simple HTTP server to serve static files (index.html)
const server = http.createServer((req, res) => {
    let filePath = req.url === '/' ? '/index.html' : req.url;
    let extname = path.extname(filePath);
    let contentType = 'text/html';

    if (extname === '.js') contentType = 'text/javascript';
    if (extname === '.css') contentType = 'text/css';

    fs.readFile(path.join(__dirname, filePath), (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end('File Not Found');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

const wss = new WebSocket.Server({ server });

let rooms = {};

function generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

console.log(`Gravity Brawl Game Server running on port ${PORT}`);

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
                        scores: { p1: 0, p2: 0 }
                    };
                    currentRoom = roomCode;
                    playerRole = 'p1';
                    ws.send(JSON.stringify({ type: 'ROOM_CREATED', roomCode, playerRole: 'p1' }));
                    console.log(`Room ${roomCode} created`);
                    break;
                }

                case 'JOIN_ROOM': {
                    const roomCode = data.roomCode;
                    if (rooms[roomCode] && !rooms[roomCode].players.p2) {
                        rooms[roomCode].players.p2 = ws;
                        currentRoom = roomCode;
                        playerRole = 'p2';

                        ws.send(JSON.stringify({ type: 'ROOM_JOINED', roomCode, playerRole: 'p2' }));
                        
                        const startMsg = JSON.stringify({ type: 'GAME_START', roomCode });
                        rooms[roomCode].players.p1.send(startMsg);
                        rooms[roomCode].players.p2.send(startMsg);
                        console.log(`Player 2 joined room ${roomCode}`);
                    } else {
                        ws.send(JSON.stringify({ type: 'ERROR', message: '방을 찾을 수 없거나 이미 플레이어가 가득 차 있습니다.' }));
                    }
                    break;
                }

                case 'GAME_STATE': {
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

                case 'PLAYER_OUT': {
                    if (currentRoom && rooms[currentRoom]) {
                        const room = rooms[currentRoom];
                        if (data.winner === 'p1') room.scores.p1++;
                        else if (data.winner === 'p2') room.scores.p2++;

                        const updateMsg = JSON.stringify({
                            type: 'SCORE_UPDATE',
                            scores: room.scores
                        });
                        if (room.players.p1) room.players.p1.send(updateMsg);
                        if (room.players.p2) room.players.p2.send(updateMsg);
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
            console.log(`Room ${currentRoom} closed.`);
        }
    });
});

server.listen(PORT);
