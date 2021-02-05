const WebSocket = require('ws')

const TIMEOUT_TIME = 10000;
const PLAYER_LIMIT = 8;
const ROWS = 8;
const COLUMNS = 9;
const CONNECT_TO = 4;

let players = [];
let queue = [];

let startingPlayer = 0;

let gameState = 0; // 0 : lobby, 1 : in progress, 2 : game over screen
let awaitingMoveFrom = 0;

function getInitTileData(rows, columns) {
    let _tileData = [];
    for (let y = 0; y < rows; y++) {
        _tileData.push( [] );
        for (let x = 0; x < columns; x++) {
            _tileData[y].push({
                x: x,
                y: y,
                occupiedBy: 0,
                highlighted: false,
            });
        }
    }
    return _tileData;
}

const INIT_TILE_DATA = getInitTileData(ROWS, COLUMNS);

let tileData = [...INIT_TILE_DATA];

function setTileOccupation(x, y, occupation) {
    tileData[y][x].occupiedBy = occupation;
}

function setTileHighlighted(x, y, highlighted) {
    tileData[y][x].highlighted = highlighted;
}

function highlightTiles(tileCoors) {
    tileCoors.map((item, i) => {
        setTileHighlighted(item.x, item.y, true);
    });
}

function dropTileAtColumn(x, playerNumber) {
    let dropRow = -1;
    for (let row = 0; row < tileData.length; row++) {
        if (tileData[row][x].occupiedBy === 0) dropRow = row;
    }
    if (dropRow > -1) setTileOccupation(x, dropRow, playerNumber);
}

function iterateTileData(callback) {
    for (let y = 0; y < tileData.length; y++) {
        for (let x = 0; x < tileData[0].length; x++) {
            callback(x, y);
        }
    }
}

function checkIfTie() {
    let tie = true;
    iterateTileData((x, y) => {
        if (tileData[y][x].occupiedBy === 0) tie = false;
    });
    return tie;
}

function checkCoordinates(coorArr, player) {
    let connected = true;
    coorArr.map((item, i) => {
        if ( item.x < 0 || item.y < 0 || item.x >= tileData[0].length || item.y >= tileData.length || tileData[item.y][item.x].occupiedBy !== player ) connected = false;
    });
    return connected;
}

function checkByFunction(xFactor, yFactor, player) {
    let connected = false;
    let tiles = [];
    iterateTileData((x, y) => {
        let coors = [];
        for (let i = 0; i < CONNECT_TO; i++) {
            coors.push({x: x + i * xFactor, y: y + i * yFactor})
        }
        const check = checkCoordinates(coors, player);
        if (check) {
            connected = true;
            tiles = coors;
        }
    });
    if (connected) highlightTiles(tiles);
    return {
        connected: connected,
        tiles: tiles
    };
}

function checkAll(player) {
    let verticalCheck = checkByFunction( 0, 1, player);
    if (verticalCheck.connected) return verticalCheck;
    let horizontalCheck = checkByFunction( 1, 0, player);
    if (horizontalCheck.connected) return horizontalCheck;
    let diagonalCheck1 = checkByFunction(1, 1, player);
    if (diagonalCheck1.connected) return diagonalCheck1;
    let diagonalCheck2 = checkByFunction(-1, 1, player);
    if (diagonalCheck2.connected) return diagonalCheck2;
    return false;
}



const wss = new WebSocket.Server({
    port: 3333,
    perMessageDeflate: {
        zlibDeflateOptions: {
            // See zlib defaults.
            chunkSize: 1024,
            memLevel: 7,
            level: 3
        },
        zlibInflateOptions: {
            chunkSize: 10 * 1024
        },
        // Other options settable:
        clientNoContextTakeover: true, // Defaults to negotiated value.
        serverNoContextTakeover: true, // Defaults to negotiated value.
        serverMaxWindowBits: 10, // Defaults to negotiated value.
        // Below options specified as default values.
        concurrencyLimit: 10, // Limits zlib concurrency for perf.
        threshold: 1024 // Size (in bytes) below which messages
        // should not be compressed.
    }
})

wss.on('connection', ws => {
    ws.on('message', message => {

        try {
            const msg = JSON.parse( message );

            switch (msg.action) {
                case 'check_registered':
                    checkRegistered(msg, ws);
                    break;
                case 'register_player':
                    registerPlayer(msg, ws);
                    break;
                case 'pong':
                    pong(msg, ws);
                    break;
                case 'make_move':
                    makeMove(msg, ws);
                    break;
                case 'set_ready':
                    setReady(msg, ws);
                    break;
            }
        } catch (e) {
            console.warning('Invalid Message Format: ' + e);
        }

    });

    console.log('New Connection.');
    updatePlayers();
    if (gameState === 1) updateTileData();
    updateGameState();
});

function assignPlayerNumber() {
    for (let i = 1; i <= PLAYER_LIMIT; i++) {
        let numberInUse = false;
        players.forEach(value => {
            if (value.playerNumber === i) numberInUse = true;
        });
        if (!numberInUse) return i;
    }
    return 0;
}

function checkRegistered(msg, ws) {
    let player = getPlayerByUUID(msg.uuid);
    if (player === undefined) {
        ws.send(JSON.stringify({
            action: 'request_username'
        }));
    } else {
        ws.send(JSON.stringify({
            action: 'info',
            text: 'Welcome back, ' + player.username + '.'
        }))
        ws.send(JSON.stringify({
            action: 'update_player',
            ready: player.ready
        }));
    }
}

function registerPlayer(msg, ws) {
    let playerNumber = 0;
    if (getPlayerByUUID(msg.uuid) === undefined && gameState === 0) {
        playerNumber = assignPlayerNumber();
        players.push({
            uuid: msg.uuid,
            lastPing: new Date(),
            playerNumber: playerNumber,
            username: msg.username,
            ready: false,
            awaitingMove: false
        });
        updatePlayers();
        ws.send(JSON.stringify({
            action: 'register_response',
            success: true,
            username: msg.username
        }));
    } else if (gameState >= 1) {
        queue.push({
            uuid: msg.uuid,
            username: msg.username,
        });
    }
    console.table(players);
}

function rotateStartingPlayer() {
    if (startingPlayer + 1 >= players.length) {
        startingPlayer = 0;
    } else {
        startingPlayer++;
    }
}

function passMove() {
    players[awaitingMoveFrom].awaitingMove = false;
    if (awaitingMoveFrom + 1 >= players.length) {
        awaitingMoveFrom = 0;
    } else {
        awaitingMoveFrom++;
    }
    players[awaitingMoveFrom].awaitingMove = true;
    updatePlayers();
}

function startGame() {
    if (players.length > 1) {
        gameState = 1;
        updateTileData();
        updateGameState();
        players[startingPlayer].awaitingMove = true;
        awaitingMoveFrom = startingPlayer;
        updatePlayers();
    } else {
        broadcastMsg({
            action: 'info',
            text: 'Couldn\'t start game. A minimum of 2 players is required to play.'
        });
    }
}

function reset() {
    rotateStartingPlayer();
    gameState = 0;
    tileData = getInitTileData(ROWS, COLUMNS);
    awaitingMoveFrom = startingPlayer;
    players.forEach(player => {
        player.ready = false;
        player.awaitingMove = false;
    });
    queue.forEach(player => {

    });
    updateGameState();
    updatePlayers();
    updateTileData();
}

function makeMove(msg, ws) {
    const player = getPlayerByUUID(msg.uuid);
    if (player.awaitingMove && gameState === 1) {
        dropTileAtColumn(msg.position.x, player.playerNumber);
        const check = checkAll(player.playerNumber);
        updateTileData();
        if (check.connected) {
            gameState = 2;
            updateGameState();
            broadcastMsg({
                action: 'game_over',
                winner: player,
            });
            setTimeout(() => {
                reset();
            }, 5000);
        } else if (checkIfTie()) {
            gameState = 2;
            updateGameState();
            broadcastMsg({
                action: 'game_over',
                winner: {username: 'No one'},
            });
            setTimeout(() => {
                reset();
            }, 5000);
        } else {
            passMove();
        }
    }
}

function setReady(msg, ws) {
    let player = getPlayerByUUID(msg.uuid);
    player.ready = msg.ready;
    updatePlayers();
    let canStartGame = true;
    players.forEach(player => {
        if (!player.ready) canStartGame = false;
    });
    if (canStartGame) {
        startGame();
    }
}

function broadcast(callback) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            callback(client);
        }
    });
}

function broadcastMsg(msg) {
    broadcast(client => {
        client.send(JSON.stringify(msg));
    });
}

function getPlayerByUUID(uuid) {
    return players.find(obj => {
        return obj.uuid === uuid;
    });
}

function updateTileData() {
    broadcastMsg({
        action: 'update_tile_data',
        tile_data: tileData
    });
}

function updatePlayers() {
    broadcastMsg({
        action: 'update_players',
        players: players
    });
}

function updateGameState() {
    broadcastMsg({
        action: 'update_game_state',
        game_state: gameState
    });
}

function cmpObjects(obj1, obj2) {
    return JSON.stringify(obj1) === JSON.stringify(obj2);
}

function ping() {
    checkTimeouts();
    broadcast(client => {
        const _msg = {
            action: 'ping'
        };
        client.send(JSON.stringify(_msg));
    });
}

function pong(msg, ws) {
    let _player = getPlayerByUUID(msg.uuid);
    if (_player !== undefined) _player.lastPing = new Date();
}

function checkTimeouts() {
    let index = 0;
    players = players.filter(item => {
        let timeDelta = new Date() - item.lastPing;
        let keep = timeDelta < TIMEOUT_TIME;
        if (!keep && awaitingMoveFrom === index) {
            awaitingMoveFrom = 0;
            players[0].awaitingMove = true;
        } else if (!keep && startingPlayer === index) {
            startingPlayer = 0;
        }
        index++;
        return keep;
    });
    updatePlayers();
}

setInterval(ping, 5000);
