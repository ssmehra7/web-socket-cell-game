import http from 'http';
import express from 'express';
import { server as WebSocketServer } from 'websocket';
import { v4 as uuidv4 } from 'uuid';

// Create Express app
const app = express();
app.get("/", (req, res) => res.sendFile(process.cwd() + "/index.html"));

// HTTP Server
app.listen(8081, () => console.log("Listening on http port 8081"));

// WebSocket Server
const httpServer = http.createServer();
httpServer.listen(8080, () => console.log("Listening.. on 8080"));

// Hashmap clients and games
const clients = {};
const games = {};

// Update game state function
const updateGameState = () => {
    for (const g of Object.keys(games)) {
        const game = games[g];
        const payLoad = {
            "method": "update",
            "game": game
        };

        game.clients.forEach(c => {
            clients[c.clientId].connection.send(JSON.stringify(payLoad));
        });
    }

    setTimeout(updateGameState, 500);
};

// WebSocket Server Setup
const wsServer = new WebSocketServer({
    "httpServer": httpServer
});

wsServer.on("request", request => {
    // Connect
    const connection = request.accept(null, request.origin);
    connection.on("open", () => console.log("opened!"));
    connection.on("close", () => console.log("closed!"));
    connection.on("message", message => {
        try {
            const result = JSON.parse(message.utf8Data);

            // Create a new game
            if (result.method === "create") {
                const clientId = result.clientId;
                
                // Validate client exists
                if (!clients[clientId]) {
                    console.error("Invalid client ID for game creation");
                    return;
                }

                const gameId = uuidv4();
                games[gameId] = {
                    "id": gameId,
                    "balls": 20,
                    "clients": [],
                    "state": {}
                };

                const payLoad = {
                    "method": "create",
                    "game": games[gameId]
                };

                const con = clients[clientId].connection;
                con.send(JSON.stringify(payLoad));
            }

            // Join a game
            if (result.method === "join") {
                const clientId = result.clientId;
                const gameId = result.gameId;

                // Validate inputs
                if (!clientId || !gameId) {
                    console.error("Missing clientId or gameId");
                    return;
                }

                // Check if game and client exist
                const game = games[gameId];
                if (!game) {
                    console.error(`Game with ID ${gameId} does not exist`);
                    return;
                }

                if (!clients[clientId]) {
                    console.error(`Client with ID ${clientId} does not exist`);
                    return;
                }

                // Check max players
                if (game.clients.length >= 3) {
                    const errorPayload = {
                        "method": "error",
                        "message": "Game is full. Maximum 3 players allowed."
                    };
                    clients[clientId].connection.send(JSON.stringify(errorPayload));
                    return;
                }

                // Assign color
                const color = {"0": "Red", "1": "Green", "2": "Blue"}[game.clients.length];
                
                // Check for duplicate client
                const isDuplicate = game.clients.some(c => c.clientId === clientId);
                if (isDuplicate) {
                    console.error(`Client ${clientId} already in the game`);
                    return;
                }

                // Add client to game
                game.clients.push({
                    "clientId": clientId,
                    "color": color
                });

                // Start the game
                if (game.clients.length === 3) {
                    updateGameState();
                }

                const payLoad = {
                    "method": "join",
                    "game": game
                };

                // Broadcast to all clients in the game
                game.clients.forEach(c => {
                    if (clients[c.clientId] && clients[c.clientId].connection) {
                        clients[c.clientId].connection.send(JSON.stringify(payLoad));
                    }
                });
            }

            // A user plays
            if (result.method === "play") {
                const gameId = result.gameId;
                const ballId = result.ballId;
                const color = result.color;

                // Validate inputs
                if (!gameId || !ballId || !color) {
                    console.error("Invalid play parameters");
                    return;
                }

                const game = games[gameId];
                if (!game) {
                    console.error(`Game with ID ${gameId} does not exist`);
                    return;
                }

                // Initialize state if not exists
                if (!game.state) {
                    game.state = {};
                }
                
                // Add play to game state
                game.state[ballId] = color;
            }
        } catch (error) {
            console.error("Error processing message:", error);
            // Send error to client
            const errorPayload = {
                "method": "error",
                "message": "An error occurred processing your request"
            };
            connection.send(JSON.stringify(errorPayload));
        }
    });

    // Handle connection errors
    connection.on('error', (error) => {
        console.error("WebSocket connection error:", error);
    });

    // Generate a new clientId
    const clientId = uuidv4();
    clients[clientId] = {
        "connection": connection
    };

    const payLoad = {
        "method": "connect",
        "clientId": clientId
    };

    // Send back the client connect
    connection.send(JSON.stringify(payLoad));
});

export { app, wsServer };