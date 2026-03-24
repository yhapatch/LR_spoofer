const fs = require('fs'); //file loader
const ini = require('ini'); //for managing .ini file for persistent settings
const {stringify} = require("ini");
var term = require('terminal-kit').terminal; //library for TUI handling
const http = require('http'); //for creating a server that pretends to be a Lovense Remote server
const https = require('https'); //for HTTPS support
const buttplug = require('buttplug') //for connecting to Intiface Central

// read config file with persistent settings
let config_raw = fs.readFileSync('./settings.ini', { encoding: 'utf-8'})
let config = ini.parse(config_raw);

//in case it doesn't update on its own
function reparse_config(){
    config_raw = fs.readFileSync('./settings.ini', { encoding: 'utf-8'})
    config = ini.parse(config_raw);
}

//for logging
let logging = false;

//these 2 bool variables determine whether script tries to open connection (and keep it) or close it
let LR_server_trying = config.LR_auto
let IC_server_trying = config.IC_auto

//text user interface prints
const tui_data = {
    "menus" : [
        {
            "id": "0",
            "title" :  "Main menu\n",
            "text" :
                "1. Lovense Remote configuration\n" +
                "2. Intiface Central Configuration\n"

        },
        {
            "id": "1",
            "title" :  "Lovense Remote Configuration\n",
            "text" :
                "1. Open/Close local server\n" +
                "2. Turn on/off automatic server initialization on startup\n" +
                "3. Change port\n" +
                "4. Turn command printing on/off\n" +
                "5. Back to main menu\n"
        },
        {
            "id": "2",
            "title" :  "Intiface Central Configuration\n",
            "text" :
                "1. Open/Close connection\n" +
                "2. Turn on/off automatic connection on startup\n" +
                "3. Change port\n" +
                "4. Change IP\n" +
                "5. Test toys\n" +
                "6. Back to main menu\n"

        },
        {
            "id": "3",
            "title" :  "Instructions\n",
            "text" : "readme"
        },
        {
            "id": "4",
            "title" :  "Input new port\n",
            "text" : ""
        },
        {
            "id": "5",
            "title" :  "Input new port\n",
            "text" : ""
        },
        {
            "id": "6",
            "title" :  "Input new ip address\n",
            "text" :
                "Don't put ws:// and port here.\n" +
                "Example: localhost\n" +
                "Example: 192.168.0.0\n"
        }
    ]
}

//an imaginary ultimate toy to send to the game
const toy_data = {
    "code": 200,
    "data": {
        "toys": "{  \"f082c00246fa\" : {    \"id\" : \"f082c00246fa\",    \"status\" : \"1\",    \"version\" : \"\",    \"name\" : \"spoofer\",    \"battery\" : 60,    \"nickName\" : \"\",    \"shortFunctionNames\" : [      \"v\",    \"r\",    \"p\",    \"t\",    \"f\",    \"s\",    \"d\",    \"o\"    ],    \"fullFunctionNames\" : [       \"Vibrate\",    \"Rotate\",    \"Pump\",    \"Thrusting\",    \"Fingering\",    \"Suction\",    \"Depth\",    \"Oscillate\"    ]  }}",
        "platform": "ios",
        "appType": "remote"
    },
    "type": "OK"
}

const toy_data_nora = {
    "code": 200,
    "data": {
        "toys": "{  \"f082c00246fa\" : {    \"id\" : \"f082c00246fa\",    \"status\" : \"1\",    \"version\" : \"\",    \"name\" : \"nora\",    \"battery\" : 60,    \"nickName\" : \"\",    \"shortFunctionNames\" : [      \"v\",    \"r\"    ],    \"fullFunctionNames\" : [       \"Vibrate\",    \"Rotate\"    ]  }}",
        "platform": "ios",
        "appType": "remote"
    },
    "type": "OK"
}
//which menu of TUI should be shown
var term_menu = 0
//which menu are we in
//0 is main menu
//1 is LR settings
//2 is Intiface settings
//3 is readme
//4 is inputting LR port
//5 is inputting IC port
//6 is inputting IC ip (can be string)


//status of connections
let LR_server_online = false
let IC_server_online = false

//this function prints TUI into terminal
async function TUI_print(){
    term.clear() //clean terminal window from previous writings
    term(tui_data["menus"][term_menu]["title"])

    //some indicators
    let online_indicator_LR
    if (LR_server_online == true){ online_indicator_LR = "^gONLINE"}
    else { online_indicator_LR = "^rOFFLINE"}

    let online_indicator_IC
    if (IC_server_online == true){ online_indicator_IC = "^gONLINE"}
    else { online_indicator_IC = "^rOFFLINE"}

    let LR_auto_indicator
    if (config.LR_auto) {LR_auto_indicator = "^gON"}
    else { LR_auto_indicator = "^rOFF"}

    let IC_auto_indicator
    if (config.IC_auto) {IC_auto_indicator = "^gON"}
    else { IC_auto_indicator = "^rOFF"}

    let LR_listen_indicator
    if (LR_server_trying) {LR_listen_indicator = "^g" + config.LR_http_port}
    else {LR_listen_indicator = "^r" + config.LR_http_port}

    term("Game status: ")(online_indicator_LR)("           Intiface status: ")(online_indicator_IC)("\n");

    //for LR menu
    if (term_menu == 1) {
        term("LR server auto init:")(LR_auto_indicator)("      Listening on port:")(LR_listen_indicator)("\n")
    }
    //for IC menu
    if (term_menu == 2) {
        term("IC connection auto init:")(IC_auto_indicator)
        term("   IC client listening on: ")
        if (IC_server_trying) {term.green("ws://" + config.IC_ip + ":" + config.IC_port + "\n")}
        else {term.red("ws://" + config.IC_ip + ":" + config.IC_port + "\n")}
    }


    term("\n")
    term(tui_data["menus"][term_menu]["text"])
    let input = await term.inputField().promise; //stop and read user's input

    //term menu 6 aka IC ip address, can be a string, so we deal with it separately
    if (term_menu == 6) {

    }
    else {
        TUI_read_input(parseInt(input, 10)); //send input into interpreter function
    }
    TUI_print() //start again. TODO: move it outside to avoid potential memory leak, as the previous iterations persist
}

//interpret user input into TUI
//Uses switch/case statements to determine behavior in different menus
function TUI_read_input(input){
    //make sure input is valid
    if (!Number.isInteger(input)) {
        return
    }

    switch (term_menu) {
        case 0: // Main menu
            if (input >= 0 && input <= 2) {
                term_menu = input
            }
            break

        case 1: // LR settings
            switch (input) {
                case 1: // Open/Close server
                    LR_server_trying = !LR_server_trying
                    LR_server_switch(LR_server_trying)
                    break
                case 2: // Switch auto connection
                    config.LR_auto = !config.LR_auto
                    fs.writeFileSync('./settings.ini', stringify(config))
                    reparse_config()
                    break
                case 3: // Going to port input screen
                    term_menu = 4
                    break
                case 4: // Turn command printing on/off
                    logging = !logging
                    break
                case 5: // Back to main menu
                    term_menu = 0
                    break
            }
            break

        case 2: // Intiface settings
            switch (input) {
                case 1: // Open/Close connection
                    IC_server_trying = !IC_server_trying
                    IC_server_switch(IC_server_trying)
                    break
                case 2: // Switch auto connection
                    config.IC_auto = !config.IC_auto
                    fs.writeFileSync('./settings.ini', stringify(config))
                    reparse_config()
                    break
                case 3: // To port change
                    term_menu = 5
                    break
                case 4: // To ip change
                    term_menu = 6
                    break
                case 5: // Test toys
                    test_toys()
                    break
                case 6: // Back to main menu
                    term_menu = 0
                    break
            }
            break

        case 3: // README/Instructions
            break

        case 4: // LR port input
            config.LR_http_port = input
            fs.writeFileSync('./settings.ini', stringify(config))
            reparse_config()
            term_menu = 1
            break

        case 5: // IC port input
            config.IC_port = input
            fs.writeFileSync('./settings.ini', stringify(config))
            reparse_config()
            term_menu = 2
            break
    }
}

function TUI_read_input_string(input){
    if (term_menu == 6) {
        config.IC_ip = input
        fs.writeFileSync('./settings.ini', stringify(config))
        reparse_config()
        term_menu = 2
    }
    return
}

//to log LR input
function TUI_logging(data){
    if (logging){
        TUI_print()
        console.log(data)
    }
}

//this object is the spoof server
//each time the game sends a request in POST format, it sends it to the parser function
const LR_server = http.createServer(function (req, res) {
    if (req.method === "POST"){
        let body = ''
        req.on('data', function(data){
            body += data
        })
        req.on('end', function(){
            LR_command_parser(body,res)
        })
    }
});

//HTTPS server for mobile devices (with self-signed certificate)
let LR_server_https;
try {
    const key = fs.readFileSync('./server.key');
    const cert = fs.readFileSync('./server.cert');
    LR_server_https = https.createServer({key: key, cert: cert}, function (req, res) {
        if (req.method === "POST"){
            let body = ''
            req.on('data', function(data){
                body += data
            })
            req.on('end', function(){
                LR_command_parser(body,res)
            })
        }
    });
} catch(ex){
    console.log("SSL certificates not found. HTTPS server will not be available.")
    console.log("To enable HTTPS, generate certificates with: openssl req -nodes -new -x509 -keyout server.key -out server.cert -days 365")
    LR_server_https = null
}

//parser function for the spoofer. check if it's a legal command, then translate it and send to Intiface handler
//don't forget to send OK message back to the game
let reply_OK = {
    "code": 200,
    "type": "ok"
}
async function LR_command_parser(body,res){
    let data = JSON.parse(body)
    TUI_logging(data)

    if (data.hasOwnProperty("command")){
        LR_server_online = true


        if (data.command == 'GetToys'){
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(toy_data))
        }
        if (data.command == 'Function'){
            //"action" should look like "action:number,action:number
            let action = data.action
            let action_array = action.split(',')

            let loopRunningSec = 0
            let loopPauseSec = 0

            if (data.hasOwnProperty("loopRunningSec")) {loopRunningSec = data.loopRunningSec}
            if (data.hasOwnProperty("loopPauseSec")) {loopPauseSec = data.loopPauseSec}

            for (let i = 0; i < action_array.length; i++) {
                let action_parts = action_array[i].split(':')
                LR_function_translate(action_parts[0], parseInt(action_parts[1], 10), parseInt(data.timeSec) * 1000, parseInt(loopRunningSec) * 1000, parseInt(loopPauseSec) * 1000)
            }

            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(reply_OK))
        }
        if (data.command == 'Position'){
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(reply_OK))
        }
        if (data.command == 'Pattern'){
            let rule = data.rule
            let rule_set = rule.split(';') // 0 is protocol, irrelevant //1 is action, 2 is interval
            let action_raw = rule_set[1].split(':') // 1 is list of orders
            if (action_raw.length = 1) {
                action_raw.push('a')
            }
            let action_list = action_raw[1].split(',') //list of commands
            let strength_list = data.strength.split(';') // make array of strength param and turn into integers
            for (let i = 0; i < strength_list.length; i++) {
                strength_list[i] = parseInt(strength_list[i])
            }
            let interval_raw = rule_set[2].split(':') // 1 is interval. first remove the #
            let interval = parseInt(interval_raw[1].slice(0, -1), 10)

            for (let i = 0; i < action_list.length; i++) {
                LR_pattern_translate(action_list[i], strength_list, parseInt(data.timeSec * 1000), interval)
            }

            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(reply_OK))
        }
        if (data.command == 'PatternV2'){
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(reply_OK))
        }
        if (data.command == 'Preset'){
            // TODO implement preset functionality
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(reply_OK))
        }
        if (data.command == 'Stop'){
            LR_abort()

            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(reply_OK))
        }
    }
}

let abort = false;
let loops_running = new Set();
let loop_id_counter = 0;

async function LR_abort(){
    abort = loops_running.size > 0;
    LR_stop();
}

async function LR_stop(){
    if (IC_server_online) {
        IC_send_vibration(0, 1)
        IC_send_oscillation(0, 1)
        IC_send_rotation(0, 1, true)
    }
}

async function LR_function_translate(action, strength, duration, loop_duration, loop_pause){
    if (action == "Stop") {
        LR_abort()
        return
    }
    if (!loop_duration) {
        loop_duration = duration;
        loop_pause = 0;
    }

    let full_iterations = parseInt(duration / (loop_duration + loop_pause)); //how many full loops
    let last_iteration = duration -  (loop_duration + loop_pause ) * full_iterations; //final incomplete loop
    if (last_iteration > loop_duration){ last_iteration = loop_duration; } // make sure it's not too long
    
    let has_final_loop = false
    if (last_iteration > 0){has_final_loop = true}
    if (duration == 0) {
        has_final_loop = true
        last_iteration = 0
    }
    
    // New CMDs should owervrite old ones, but calling LR_abort creates gaps
    if (loops_running.size > 0){
        abort = true;
    } else {
        abort = false;
    }
    const loop_id = loop_id_counter++;
    loops_running.add(loop_id);
    if (IC_server_online){
        //MAIN LOOP
        for (let i = 0; i < full_iterations; i++) {

            switch (action) {
                case "Vibrate": // vibrate
                    console.log("sent_vibration")
                    await IC_send_vibration(strength / 20, loop_duration)
                    break
                case "Rotate": // rotate
                    await IC_send_rotation(strength / 20, loop_duration, true)
                    //console.log("sent_rotation")
                    break
                case "Pump": // pump
                    break
                case "Thrusting": // thrust
                    await IC_send_oscillation(strength / 20, loop_duration)
                    //console.log("sent_oscillation")
                    break
                case "Fingeringf": // fingering
                    break
                case "Suction": // suction
                    break
                case "All": // all
                    await Promise.all([
                        IC_send_vibration(strength / 20, loop_duration),
                        IC_send_oscillation(strength / 20, loop_duration),
                        IC_send_rotation(strength / 20, loop_duration, true)
                    ])
                    break
            }

            await new Promise(r => setTimeout(r, loop_pause));
            if (abort) break;
        }

        //LAST ITERATION
        if (has_final_loop && !abort) {
            switch (action) {
                case "Vibrate": // vibrate
                    IC_send_vibration(strength / 20, last_iteration)
                    break
                case "Rotate": // rotate
                    await IC_send_rotation(strength / 20, loop_duration, true)
                    //console.log("sent_rotation")
                    break
                case "Pump": // pump
                    break
                case "Thrusting": // thrust
                    await IC_send_oscillation(strength / 20, loop_duration)
                    //console.log("sent_oscillation")
                    break
                case "Fingeringf": // fingering
                    break
                case "Suction": // suction
                    break
                case "All": // all
                    await Promise.all([
                        IC_send_vibration(strength / 20, loop_duration),
                        IC_send_oscillation(strength / 20, loop_duration),
                        IC_send_rotation(strength / 20, loop_duration, true)
                    ])
                    break
            }
        }
    }
    if(!abort) {
        LR_stop();
    }
    abort = false;
    loops_running.delete(loop_id);
}

async function LR_pattern_translate(action, strength_list, duration, interval){
    let iterations = parseInt(duration / interval)
    if (iterations == 0) {iterations = 3600} // for when timeSec is set as 0, meaning indefinite
    
    // Lengthen the interval to ensure that overhead doesn't cause gaps in pattern
    interval += 50;
    
    let j = 0 //index for strength_list
    const strength_len = strength_list.length;

    // New CMDs should owervrite old ones, but calling LR_abort creates gaps
    if (loops_running.size > 0){
        abort = true;
    } else {
        abort = false;
    }
    const loop_id = loop_id_counter++;
    loops_running.add(loop_id);
    if (IC_server_online) {
        for (let i = 0; i < iterations; i++) {
            switch (action) {
                case "v": // vibrate
                    await IC_send_vibration(strength_list[j] / 20, interval)
                    console.log("sent_vibration")
                    break
                case "r": // rotate
                    await IC_send_rotation(strength_list[j] / 20, interval, true)
                    //console.log("sent_rotation")
                    break
                case "p": // pump
                    break
                case "t": // thrust
                    await IC_send_oscillation(strength_list[j] / 20, interval)
                    //console.log("sent_oscillation")
                    break
                case "f": // fingering
                    break
                case "s": // suction
                    break
                case "a": // all
                    await Promise.all([
                        IC_send_vibration(strength_list[j] / 20, interval),
                        IC_send_oscillation(strength_list[j] / 20, interval),
                        IC_send_rotation(strength_list[j] / 20, interval, true)
                    ]) 
                    break
            }
            j++;
            j %= strength_len;
            // await new Promise(r => setTimeout(r, interval));
            if (abort) break;
        }
        if(!abort) {
            LR_stop();
        }
        abort = false;
        loops_running.delete(loop_id);
    }
}

//function to turn on and off the spoofer
function LR_server_switch(server_switch){
    if (server_switch) {
        try {
            LR_server.listen(config.LR_http_port)

            LR_server.on('error', (e) => {
                if (e.code === 'EADDRINUSE'){
                    console.error("LR port is currently in use")
                }
            })
            
            // Also start HTTPS server on port+1 if certificates are available
            if (LR_server_https) {
                const https_port = config.LR_https_port
                LR_server_https.listen(https_port)
                
                LR_server_https.on('error', (e) => {
                    if (e.code === 'EADDRINUSE'){
                        console.error("LR HTTPS port is currently in use")
                    }
                })
            }
        } catch(ex){
            console.log(ex)
        }

        }

    else {
        if (LR_server) LR_server.close();
        if (LR_server_https) LR_server_https.close();
    }
}

let client


async function IC_connect() {

    let address = "ws://" + config.IC_ip + ":" + config.IC_port
    const connector = new buttplug.ButtplugBrowserWebsocketClientConnector(address);
    client = new buttplug.ButtplugClient("LR_spoofer");

    client.addListener('disconnect', ()=>{
        IC_server_online = false;
    })

    //try opening connection
    while (IC_server_trying && !IC_server_online) {
        try {
            await client.connect(connector);
            break
        } catch (ex) {
        }
    }



    IC_server_online = true;

    client.startScanning()
    //IC_send_vibration(1,1000)
    test_toys()

}
//////////////////////////////////////////////////
//TOY CONTROLS
//TODO: other controls
/////////////////////////////////////////////////
let vibrating = false
let oscillating = false
let rotating = false


//send vibration to all toys
async function IC_send_vibration(speed, duration){
    try {
        client.devices.forEach((device) => {
            if (device.vibrateAttributes.length == 0) {
                return;
            }
            device.vibrate(speed)
            vibrating = true
        });
        if (duration > 0) {
            await new Promise(r => setTimeout(r, duration));
            // Abort has already stopped devices
            if (abort) return;
            client.devices.forEach((device) => {
                if (device.vibrateAttributes.length == 0) {
                    return;
                }
                device.vibrate(0)
            });
            vibrating = false
        }
    } catch (e){console.log(e)}

}
//send oscillation to all toys
async function IC_send_oscillation(speed, duration){
    try {
        client.devices.forEach((device) => {
            if (device.oscillateAttributes.length == 0) {
                return;
            }
            device.oscillate(speed)
            oscilating = true
        });
        if (duration > 0) {
            await new Promise(r => setTimeout(r, duration));
            // Abort has already stopped devices
            if (abort) return;
            client.devices.forEach((device) => {
                if (device.oscillateAttributes.length == 0) {
                    return;
                }
                device.oscillate(0)
            });
            oscillating = false
        }
    } catch (e){console.log(e)}

}
//send rotation to all toys
async function IC_send_rotation(speed, duration, clockwise) {
    try {
        client.devices.forEach((device) => {
            if (device.rotateAttributes.length == 0) {
                return;
            }
            device.rotate(speed, clockwise)
            rotating = true
        });
        if (duration > 0) {
            await new Promise(r => setTimeout(r, duration));
            // Abort has already stopped devices
            if (abort) return;
            client.devices.forEach((device) => {
                if (device.rotateAttributes.length == 0) {
                    return;
                }
                device.rotate(0, true)
            });
            rotating = false
        }
    } catch (e){console.log(e)}

}



//disconnect from IC
function IC_disconnect(){
    client.disconnect()
    IC_server_online = false
}


//turn IC connection on and off
function IC_server_switch(server_switch){
    if (server_switch){
        IC_connect()

    }
    else if (IC_server_online){
        IC_disconnect()
    }
}

function test_toys(){
    if (IC_server_online) {
        IC_send_vibration(1, 1000)
        IC_send_oscillation(1, 1000)
        IC_send_rotation(1, 1000, true)
    }
}

//here the logic of the script begins
//open connections if they are set to be open on start
LR_server_switch(LR_server_trying);
IC_server_switch(IC_server_trying);

//initiate TUI
TUI_print()
