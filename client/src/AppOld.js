
import './App.scss';
import {Stage, Sprite, useTick, Text} from '@inlet/react-pixi';
import { useState, useEffect } from 'react';
import neverMeant from './assets/neverMeant.png';
import bg from './assets/bg.jpg';
import { Howl, Howler} from 'howler';
import music from './assets/neverMeant.wav';

const SPEED_MULTIPLIER = 6;

let WS_URL = process.env.NODE_ENV === 'development' ? 'ws://localhost:3123' : 'wss://nevermeant.photonbeam.ch:3133';

function gen_uuid(){
    let dt = new Date().getTime();
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = (dt + Math.random()*16)%16 | 0;
        dt = Math.floor(dt/16);
        return (c==='x' ? r :(r&0x3|0x8)).toString(16);
    });
    return uuid;
}

const uuid = localStorage.getItem('uuid') === null ? gen_uuid() : localStorage.getItem('uuid');
localStorage.setItem('uuid', uuid);

const bgMusic = new Howl({
    src: [music],
    loop: true,
    autoplay: true,
    volume: 0.05,
});

if (localStorage.getItem('music_timestamp') !== null) bgMusic.seek(localStorage.getItem('music_timestamp'));

setInterval(() => {
    localStorage.setItem('music_timestamp', bgMusic.seek());
}, 250);

function App() {
    const [ ws, setWs ] = useState( false );
    const [ wsOpen, setWsOpen ] = useState( false );
    const [ players, setPlayers ] = useState( [

    ] );

    useEffect(() => {
        const _ws = new WebSocket(WS_URL);
        _ws.addEventListener('open', () => setWsOpen( true ));
        _ws.addEventListener('error', () => setWsOpen( false ));
        _ws.addEventListener('message', _msg => {
            const msg = JSON.parse(_msg.data);
            switch(msg.action) {
                case 'update_players':
                    setPlayers(msg.players);
                    break;
                case 'ping':
                    _ws.send(JSON.stringify({
                        action: 'pong',
                        uuid: uuid,
                    }));
                    break;
            }
        });
        setWs(_ws);
    }, []);

    return (
        <div className="App">
            <Stage options={{backgroundColor: 0x555555}} width={1024} height={1024}>
                <Sprite image={bg} x={0} y={0} width={1024} height={1024} />
                <MainPlayer uuid={uuid} />
                {
                    players.map((item, i) => (
                        <Player key={i} index={i} player={item} />
                    ))
                }
            </Stage>
        </div>
    );
}

function MainPlayer(props) {
    const [ pos, setPos ] = useState( {x: 256 + Math.random() * 256, y: 64 + Math.random() * 512} );
    const [ vel, setVel ] = useState( {x: 0, y: 0} );
    const [ rot, setRot ] = useState( (Math.random() -.5) * 0.1 );
    const dimSeed = Math.random();
    const [ dim, setDim ] = useState( {x: 128 + dimSeed * 32, y: 128 + dimSeed * 32} );
    const [ ws, setWs ] = useState( false );
    const [ wsOpen, setWsOpen ] = useState( false );

    useEffect(() => {
        // Event listeners
        function setVelY(val) {
            let _vel = { ...vel };
            _vel.y = val;
            setVel(_vel);
        }

        function setVelX(val) {
            let _vel = { ...vel };
            _vel.x = val;
            setVel(_vel);
        }

        document.onkeydown = function(e) {
            switch(e.key) {
                case 'w':
                    setVelY(-1);
                    break;
                case 's':
                    setVelY(1);
                    break;
                case 'a':
                    setVelX(-1);
                    break;
                case 'd':
                    setVelX(1);
                    break;
            }

        }

        document.onkeyup = function(e) {
            switch(e.key) {
                case 'w':
                    setVelY(0);
                    break;
                case 's':
                    setVelY(0);
                    break;
                case 'a':
                    setVelX(0);
                    break;
                case 'd':
                    setVelX(0);
                    break;
            }

        }

        const _ws = new WebSocket(WS_URL);

        _ws.addEventListener('open', () => {
            const msg = {
                action: 'register_player',
                position: pos,
                uuid: uuid,
            };
            _ws.send(JSON.stringify(msg));
            setWsOpen( true );
        });

        _ws.addEventListener('error', () => {
            setWsOpen( false );
        });

        setWs(_ws);
    }, []);

    useTick(delta => {
        let _pos = { ...pos};
        _pos.x += vel.x * delta * SPEED_MULTIPLIER;
        _pos.y += vel.y * delta * SPEED_MULTIPLIER;
        setPos(_pos);
        if (wsOpen) {
            const msg = {
                action: 'set_position',
                position: _pos,
                uuid: uuid,
            };
            ws.send(JSON.stringify(msg));
        }
    });

    return (
        <Sprite image={neverMeant} x={pos.x} y={pos.y} rotation={rot} height={dim.y} width={dim.x} />
    );
}

function Player(props) {
    return (
        props.player.uuid !== uuid ? (<Sprite image={neverMeant} x={props.player.position.x} y={props.player.position.y} height={128} width={128} />) : <Text text={''} />
    );
}

export default App;
