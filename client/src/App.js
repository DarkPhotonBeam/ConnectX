import './App.scss';
import { useState, useEffect } from 'react';
import music from './assets/theCursedLand.mp3';
import { Howl, Howler} from 'howler';

const bgMusic = new Howl({
    src: [music],
    loop: true,
    autoplay: true,
    volume: 0.025,
});

if (localStorage.getItem('music_timestamp') !== null) bgMusic.seek(localStorage.getItem('music_timestamp'));

setInterval(() => {
    localStorage.setItem('music_timestamp', bgMusic.seek());
}, 250);

function gen_uuid(){
    let dt = new Date().getTime();
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = (dt + Math.random()*16)%16 | 0;
        dt = Math.floor(dt/16);
        return (c==='x' ? r :(r&0x3|0x8)).toString(16);
    });
    return uuid;
}

let WS_URL = process.env.NODE_ENV === 'development' ? 'ws://localhost:3333' : 'wss://connect4.photonbeam.ch:3313';
if (localStorage.getItem('player') === null) localStorage.setItem('player', '1');
const uuid = localStorage.getItem('uuid') === null ? gen_uuid() : localStorage.getItem('uuid');
localStorage.setItem('uuid', uuid);

const ws = new WebSocket(WS_URL);

function sendMsg(msg) {
    ws.send(JSON.stringify(msg));
}

function App() {
    const [ tileData, setTileData ] = useState( [] );
    const [ players, setPlayers ] = useState( [] );
    const [ gameState, setGameState ] = useState( 0 );
    const [ requestedUsername, setRequestedUsername ] = useState( false );
    const [ winner, setWinner ] = useState( [] );

    useEffect(() => {
        ws.addEventListener('message', msg => {
            const _msg = JSON.parse(msg.data);
            switch(_msg.action) {
                case 'update_players':
                    setPlayers(_msg.players);
                    break;
                case 'update_game_state':
                    console.log(_msg.game_state);
                    setGameState(_msg.game_state);
                    break;
                case 'ping':
                    ws.send(JSON.stringify({
                        action: 'pong',
                        uuid: uuid,
                    }));
                    break;
                case 'update_tile_data':
                    setTileData(_msg.tile_data);
                    break;
                case 'info':
                    console.log(_msg.text);
                    break;
                case 'request_username':
                    if (localStorage.getItem('username') === null) {
                        setRequestedUsername(true);
                    } else {
                        sendMsg({
                            action: 'register_player',
                            uuid: uuid,
                            username: localStorage.getItem('username'),
                        });
                    }
                    break;
                case 'register_response':
                    if (_msg.success) {
                        localStorage.setItem('username', _msg.username);
                        setRequestedUsername(false);
                    }
                    break;
                case 'game_over':
                    setWinner(_msg.winner);
                    break;
            }
        })

        ws.addEventListener('open', msg => {
            sendMsg({
                action: 'check_registered',
                uuid: uuid,
            });
        });
    }, []);

    function waitingFor() {
        let _player = [];
        players.forEach(player => {
            if (player.awaitingMove) _player = {...player};
        });
        _player.username += "'s";
        if (_player.uuid === uuid) _player.username = 'Your';
        return _player;
    }

    return (
        <div className={'App'}>
            {
                requestedUsername ? (
                    <RegistrationForm />
                ) : gameState === 0 ? (
                    <Lobby players={players} />
                ) : gameState >= 1 ? (
                    <div>
                        {
                            gameState === 2 ? (
                                <div className={'GameOverScreen'}>
                                    <h1>{winner.username} won!</h1>
                                </div>
                            ) : ''
                        }
                        <Board gameState={gameState} tileData={tileData} />
                        {
                            gameState === 1 ? (
                                <div className={'TurnInfo'}>
                                    <span className={'player-color-' + waitingFor().playerNumber}>{waitingFor().username} turn</span>
                                </div>
                            ) : ''
                        }
                    </div>
                ) : ''
            }
            <div className={'Logo'}>
                <span className={'Logo__connect'}>connect</span><span className={'Logo__4'}>4</span>
            </div>
            <ul className={'PlayerList'}>
                {
                    players.map((item, i) => (
                        <li key={i} className={'PlayerList__player' + (item.awaitingMove ? ' awaitingMove' : '')}><span className={'PlayerList__playerColor player-' + (item.playerNumber)}></span>{item.username} {item.ready && gameState === 0 ? <i className="fas fa-check"></i> : ''}</li>
                        )
                    )
                }
            </ul>
        </div>
    );
}

function RegistrationForm() {
    const [ username, setUsername ] = useState( '' );
    const [ error, setError ] = useState( '' );

    function register() {
        if (username === '') {
            setError('Username must not be empty');
        } else {
            setError('');
            // Try register
            sendMsg({
                action: 'register_player',
                uuid: uuid,
                username: username,
            });
        }
    }

    return (
        <div className={'RegistrationForm'}>
            <h1 className={'RegistrationForm__label'}>Enter A Username</h1>
            <input maxLength={16} onKeyPress={e => {if (e.key === 'Enter') register();}} onChange={e => setUsername(e.currentTarget.value)} className={'RegistrationForm__input'} type={'text'} value={username} />
            <div className={'RegistrationForm__submit btn'} onClick={register}>JOIN</div>
            {
                error === '' ? '' : (
                    <div className={'RegistrationForm__error'}>{error}</div>
                )
            }
        </div>
    );
}

function Lobby(props) {
    const [ ready, setReady ] = useState( false );

    useEffect(() => {
        ws.addEventListener('message', msg => {
            const _msg = JSON.parse(msg.data);
            switch(_msg.action) {
                case 'update_player':
                    setReady( _msg.ready );
                    break;
            }
        })
    }, []);

    function toggleReady() {
        sendMsg({
            action: 'set_ready',
            ready: !ready,
            uuid: uuid
        });
        setReady(!ready);
    }

    return (
        <div className={'Lobby'}>
            <h1 className={'Lobby__title'}>Lobby</h1>
            <h3 className={'Lobby__playerCount'}>{props.players.length} Player{props.players.length > 1 ? 's' : ''}</h3>
            <div className={'btn' + (ready ? ' active' : '')} onClick={toggleReady}>{ready ? 'UNREADY' : 'READY UP'}</div>
        </div>
    );
}

function Board(props) {
    return (
        <div className={'Board' + (props.gameState === 2 ? ' gameover' : '')}>
            {
                props.tileData.map((item, i) => (
                    <BoardRow row={item} key={i} />
                ))
            }
        </div>
    );
}

function BoardRow(props) {
    return (
        <div className={'Board__row'}>
            {
                props.row.map((item, i) => (
                    <Tile highlighted={item.highlighted} occupation={item.occupiedBy} x={item.x} y={item.y} key={i} />
                ))
            }
        </div>
    );
}

function Tile(props) {
    function occupy() {
        //props.dropTileAtColumn(props.x);
        sendMsg({
            action: 'make_move',
            uuid: uuid,
            position: {x: props.x, y: props.y}
        });
    }

    useEffect(() => {
        console.log('Occ: ' + props.occupation);
    }, [props.occupation]);

    return (
        <div className={'Tile'}>
            <div className={'Tile__cutout'} onClick={occupy}>
                {
                    props.occupation > 0 ? (
                        <div className={'Tile__token occupied-by-' + props.occupation + (props.highlighted ? ' highlighted' : '')}></div>
                    ) : ''
                }
            </div>
        </div>
    );
}

export default App;
