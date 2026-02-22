require("dotenv").config();
const http = require("http");
const app = require("./app");
const connectDB = require("./src/config/db");
const socketUtil = require("./src/utils/socket");

connectDB();

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

// Initialize Socket.io
const io = socketUtil.init(server);

io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // Join a room based on userId so we can send private notifications
    socket.on("join", (userId) => {
        if (userId) {
            socket.join(userId);
            console.log(`User ${userId} joined room ${userId}`);
        }
    });

    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
    });
});
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);
server.listen(PORT, () =>
    console.log(`🚀 Server running on port ${PORT}`)
);
