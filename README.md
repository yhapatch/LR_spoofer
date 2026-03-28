This is a script that lets you create a local server on your device that emulates a Lovense Remote server, then translates toy commands and sends them to Intiface Central server.

///////////////////////////////////////////////////////////////////////////////////////

Requirements: 
* Windows / Linux
* (npm) (package management)
* Node.js
* Intiface Central
* A game with Lovense Remote integration

//////////////////////////////////////////////////////////////////////////////////////

Instructions:
  1. Start your Intiface Central server
  2. Use ```start.bat``` or ```node index.js``` to initialize the script  
  2.1 Run ```npm install``` or ```npm run modules``` if dependencies aren't installed
  3. At this point Intiface Central should receive connection from LR_spoofer. If that doesn't happen, make sure the script uses correct ip and port for IC. You can edit them in settings.ini or in user interface
  4. Open your game's Lovense Remote integration menu
  5. Input 'localhost' in server ip and '3003' in server port. you can edit used port in settings.ini or in user interface. Connect to the server  
  5.1 If the game uses HTTPS/TLS then you need to use port '3004' and create certificates with something like ```openssl req -nodes -new -x509 -keyout server.key -out server.cert -days 365``` (filenames are important)
     
As of version 0.0.2, the script supports Function and Pattern commands for Lovense Remote, and sends Vibration, Oscillation and Rotation commands to Intiface Central.

//////////////////////////////////////////////////////////////////////////////////////

It currently only works with games with Lovense Remote integration that require ip and port of a Lovense server. Integration of other types of connections is planned.
This script cannot be used for anything other than games with Lovense Remote inegration. It can't be used for cam/tipping, video/audio synchronization, etc. Those features aren't planned to be added.

Confirmed games it works with:
* Voidbound
* Third Crisis
* Karryn's Prison

//////////////////////////////////////////////////////////////////////////////////////
