const fs = require('fs'); //file loader
const ini = require('ini'); //for managing .ini file for persistent settings
const {stringify} = require("ini");
var term = require('terminal-kit').terminal; //library for TUI handling
const http = require('http'); //for creating a server that pretends to be a Lovense Remote server
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
    if (LR_server_trying) {LR_listen_indicator = "^g" + config.LR_port}
    else {LR_listen_indicator = "^r" + config.LR_port}

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
//Nested 'if' statements to determine behavior in different menus, for different legal inputs
//TODO: redo using cases
function TUI_read_input(input){
    //make sure input is valid
    if (Number.isInteger(input)) {
        //if in main menu, move between menus
        if (term_menu == 0) {
            if (input >= 0 && input <= 2) {
                term_menu = input
            }
            return
        }
        //LR settings
        if (term_menu == 1){ //try to open/close server
            if (input == 1){
                LR_server_trying = ! LR_server_trying
                LR_server_switch(LR_server_trying)
            }
            if (input == 2){ //switch auto connection
                config.LR_auto = ! config.LR_auto
                fs.writeFileSync('./settings.ini', stringify(config))
                reparse_config()
            }
            if (input == 3){
                term_menu = 4 //going to port input screen
            }
            if (input == 4){
                logging = ! logging

            }
            if (input == 5){
                term_menu = 0 //back to main menu
            }
        return
        }
        //Intiface settings
        if (term_menu == 2){ //try to open/close connection
            if (input == 1){
                IC_server_trying = ! IC_server_trying
                IC_server_switch(IC_server_trying)
            }
            if (input == 2){ //switch auto connection
                config.IC_auto = ! config.IC_auto
                fs.writeFileSync('./settings.ini', stringify(config))
                reparse_config()
            }
            if (input == 3){
                term_menu = 5 // to port change
            }
            if (input == 4){
                term_menu = 6 // to ip change
            }
            if (input == 5){
                test_toys()
            }
            if (input == 6){
                term_menu = 0 // back to main menu
            }

        }
        return
        //readme
        if (term_menu == 3){}
        }
        //LR port input
        if (term_menu == 4){
            config.LR_port = input
            fs.writeFileSync('./settings.ini', stringify(config))
            reparse_config()
            term_menu = 1
        return
        }
        //IC port input
        if (term_menu == 5){
            config.IC_port = input
            fs.writeFileSync('./settings.ini', stringify(config))
            reparse_config()
            term_menu = 2
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

//parser function for the spoofer. check if it's a legal command, then translate it and send to Intiface handler
//don't forget to send OK message back to the game
function LR_command_parser(body,res){
    let data = JSON.parse(body)
    TUI_logging(data)
    let reply_OK = {
        "code": 200,
        "type": "ok"
    }

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
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(reply_OK))
        }
        if (data.command == 'Stop'){
            LR_stop_translate()

            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(reply_OK))


        }
    }
}

let LR_stop = false


async function LR_stop_translate(){
    if (IC_server_online) {
        IC_send_vibration(0, 1)
        IC_send_oscillation(0, 1)
        IC_send_rotation(0, 1, true)

        LR_stop = true
        await new Promise(r => setTimeout(r, 100));
        LR_stop = false
    }
}

async function LR_function_translate(action, strength, duration, loop_duration, loop_pause){
    let full_iterations = parseInt(duration / loop_duration + loop_pause); //how many full loops
    let last_iteration = duration -  (loop_duration + loop_pause ) * full_iterations; //final incomplete loop
    if (last_iteration > loop_duration){ last_iteration = loop_duration; } // make sure it's not too long

    let has_final_loop = false
    if (last_iteration > 0){has_final_loop = true}
    if (duration == 0) {
        has_final_loop = true
        last_iteration = 0
    }

    if (IC_server_online){

        //MAIN LOOP
        for (let i = 0; i < full_iterations; i++) {

            if (LR_stop) {break}

            //vibrate
            if (action == "Vibrate") {
                IC_send_vibration(strength / 20, loop_duration)
                //console.log("sent_vibration")
            }
            //rotate
            if (action == "Rotate") {
                IC_send_rotation(strength / 20, loop_duration, true)
                //console.log("sent_rotation")
            }
            //pump
            if (action == "Pump") {
            }
            //thrust
            if (action == "Thrusting") {
                IC_send_oscillation(strength / 20, loop_duration)
                //console.log("sent_oscillation")
            }
            //fingering
            if (action == "Fingering") {
            }
            //suction
            if (action == "Suction") {
            }
            //depth
            if (action == "Depth") {}
            //all
            if (action == "All") {
                if (! vibrating) {IC_send_vibration(strength / 20, loop_duration)}
                if (! oscillating) {IC_send_oscillation(strength / 20, loop_duration)}
                if (! rotating) {IC_send_rotation(strength / 20, loop_duration, true)}
            }

            await new Promise(r => setTimeout(r, loop_pause));
        }

        //LAST ITERATION
        if (has_final_loop && ! LR_stop) {
            //vibrate
            if (action == "Vibrate") {
                IC_send_vibration(strength / 20, last_iteration)
                //console.log("sent_vibration")
            }
            //rotate
            if (action == "Rotate") {
                IC_send_rotation(strength / 20, last_iteration, true)
                //console.log("sent_rotation")
            }
            //pump
            if (action == "Pump") {
            }
            //thrust
            if (action == "Thrusting") {
                IC_send_oscillation(strength / 20, last_iteration)
                //console.log("sent_oscillation")
            }
            //fingering
            if (action == "Fingering") {
            }
            //suction
            if (action == "Suction") {
            }
            //depth
            if (action == "Depth") {
            }
            //all
            if (action == "All") {
                if (!vibrating) {
                    IC_send_vibration(strength / 20, last_iteration)
                }
                if (!oscillating) {
                    IC_send_oscillation(strength / 20, last_iteration)
                }
                if (!rotating) {
                    IC_send_rotation(strength / 20, last_iteration, true)
                }
            }
        }
    }
}

async function LR_pattern_translate(action, strength_list, duration, interval){
    let iterations = parseInt(duration / interval)
    if (iterations == 0) {iterations = 99999} // for when timeSec is set as 0, meaning indefinite

    let j = 0 //index for strength_list

    if (IC_server_online) {
        for (let i = 0; i < iterations; i++) {
            if (j > strength_list.length - 1) {
                j = 0
            } //let j index loop

            if (LR_stop) {break}

            await new Promise(r => setTimeout(r, interval));

            //vibrate
            if (action == "v") {

                IC_send_vibration(strength_list[j] / 20, 0)
                console.log("sent_vibration")
            }
            //rotate
            if (action == "r") {
                IC_send_rotation(strength_list[j] / 20, 0, true)
                //console.log("sent_rotation")
            }
            //pump
            if (action == "p") {
            }
            //thrust
            if (action == "t") {
                IC_send_oscillation(strength_list[j] / 20, 0)
                //console.log("sent_oscillation")
            }
            //fingering
            if (action == "f") {
            }
            //suction
            if (action == "s") {
            }
            //all
            if (action == "a") {
                if (! vibrating) {IC_send_vibration(strength_list[j] / 20, 0)}
                if (! oscillating) {IC_send_oscillation(strength_list[j] / 20, 0)}
                if (! rotating) {IC_send_rotation(strength_list[j] / 20, 0, true)}
            }
        }
        j += 1
        IC_send_vibration(0,1)
        IC_send_oscillation(0,1)
        IC_send_rotation(0,1,true)
    }
}

//function to turn on and off the spoofer
function LR_server_switch(server_switch){
    if (server_switch) {
        try {
            LR_server.listen(config.LR_port)

            LR_server.on('error', (e) => {
                if (e.code === 'EADDRINUSE'){
                    console.error("LR port is currently in use")
                }
            })
        } catch(ex){
            console.log(ex)
        }

        }

    else {
        LR_server.close()
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
        await client.devices.forEach((device) => {
            if (device.vibrateAttributes.length == 0) {
                return;
            }
            device.vibrate(speed)
            vibrating = true
        });
        if (duration > 0) {
            await new Promise(r => setTimeout(r, duration));
            await client.devices.forEach((device) => {
                if (device.vibrateAttributes.length == 0) {
                    return;
                }
                device.vibrate(0)
                vibrating = false
            });
        }
    } catch (e){console.log(e)}

}
//send oscillation to all toys
async function IC_send_oscillation(speed, duration){
    try {
        await client.devices.forEach((device) => {
            if (device.oscillateAttributes.length == 0) {
                return;
            }
            device.oscillate(speed)
            oscilating = true
        });
        if (duration > 0) {
            await new Promise(r => setTimeout(r, duration));
            await client.devices.forEach((device) => {
                if (device.oscillateAttributes.length == 0) {
                    return;
                }
                device.oscillate(0)
                oscilating = false
            });
        }
    } catch (e){console.log(e)}

}
//send rotation to all toys
async function IC_send_rotation(speed, duration, clockwise) {
    try {
        await client.devices.forEach((device) => {
            if (device.rotateAttributes.length == 0) {
                return;
            }
            device.rotate(speed, clockwise)
            rotating = true
        });
        if (duration > 0) {
            await new Promise(r => setTimeout(r, duration));
            await client.devices.forEach((device) => {
                if (device.rotateAttributes.length == 0) {
                    return;
                }
                device.rotate(0, true)
                rotating = false
            });
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