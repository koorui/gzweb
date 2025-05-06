#!/usr/bin/env node

"use strict"

const WebSocketServer = require('websocket').server;
const http = require('http');
const fs = require('fs');
const path = require('path');
var gzbridge;
try {
  gzbridge = require('./build/Release/gzbridge');
} catch (e) {
  try {
    gzbridge = require('./build/Debug/gzbridge');
  } catch (e) {
    console.error('无法加载 gzbridge 模块。请确保已经正确编译。');
    console.error(e);
    process.exit(1);
  }
}
const express = require('express');
const gznode = gzbridge;

/**
 * Path from where the static site is served
 */
const staticBasePath = './../http/client';

/**
 * Port to serve from, defaults to 8080
 */
const port = process.argv[2] || 8080;

/**
 * Array of websocket connections currently active, if it is empty, there are no
 * clients connected.
 */
let connections = [];

/**
 * Holds the message containing all material scripts in case there is no
 * gzserver connected
 */
let materialScriptsMessage = {};

/**
 * Whether currently connected to a gzserver
 */
let isConnected = false;

const app = express();

app.use(express.json());
app.use(express.static(path.resolve(staticBasePath)));

// API 路由
app.post('/api/save-sdf', (req, res) => {
  try {
    const sdfContent = req.body.sdf;
    let fileName = req.body.fileName || '';
    if (!sdfContent) {
      return res.status(400).json({ success: false, message: '没有收到SDF内容' });
    }
    if (!fileName || typeof fileName !== 'string') {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      fileName = `scene_${timestamp}.sdf`;
    }
    // 防止路径穿越
    fileName = fileName.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const filename = path.join(__dirname, '../saved_models', fileName);
    const dir = path.dirname(filename);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filename, sdfContent, 'utf8');
    res.json({
      success: true,
      message: '场景已保存',
      filename: filename
    });
  } catch (error) {
    console.error('保存场景错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误',
      error: error.message
    });
  }
});

// 获取服务器上所有已保存的 SDF 文件列表
app.get('/api/list-sdf', (req, res) => {
  const dir = path.join(__dirname, '../saved_models');
  fs.readdir(dir, (err, files) => {
    if (err) {
      return res.status(500).json({success: false, message: '读取目录失败'});
    }
    // 只返回 .sdf 文件
    const sdfFiles = files.filter(f => f.endsWith('.sdf'));
    res.json({success: true, files: sdfFiles});
  });
});

// 获取指定 SDF 文件内容
app.get('/api/get-sdf', (req, res) => {
  const fileName = req.query.file;
  if (!fileName || typeof fileName !== 'string') {
    return res.status(400).json({success: false, message: '缺少文件名'});
  }
  // 防止路径穿越
  const safeName = fileName.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  const filePath = path.join(__dirname, '../saved_models', safeName);
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(404).json({success: false, message: '文件不存在'});
    }
    res.json({success: true, content: data});
  });
});

// 创建 httpServer 并挂载 express
const httpServer = http.createServer(app);
httpServer.listen(port);
console.log(new Date() + " Static server listening on port: " + port);

// Websocket
let gzNode = new gzbridge.GZNode();
if (gzNode.getIsGzServerConnected())
{
  gzNode.loadMaterialScripts(staticBasePath + '/assets');
  gzNode.setPoseMsgFilterMinimumAge(0.02);
  gzNode.setPoseMsgFilterMinimumDistanceSquared(0.00001);
  gzNode.setPoseMsgFilterMinimumQuaternionSquared(0.00001);

  console.log('--------------------------------------------------------------');
  console.log('Gazebo transport node connected to gzserver.');
  console.log('Pose message filter parameters between successive messages: ');
  console.log('  minimum seconds: ' +
      gzNode.getPoseMsgFilterMinimumAge());
  console.log('  minimum XYZ distance squared: ' +
      gzNode.getPoseMsgFilterMinimumDistanceSquared());
  console.log('  minimum Quartenion distance squared:'
      + ' ' + gzNode.getPoseMsgFilterMinimumQuaternionSquared());
  console.log('--------------------------------------------------------------');
}
else
{
  materialScriptsMessage =
      gzNode.getMaterialScriptsMessage(staticBasePath + '/assets');
}

// Start websocket server
let wsServer = new WebSocketServer({
  httpServer: httpServer,
  // You should not use autoAcceptConnections for production
  // applications, as it defeats all standard cross-origin protection
  // facilities built into the protocol and the browser.  You should
  // *always* verify the connection's origin and decide whether or not
  // to accept it.
  autoAcceptConnections: false
});

wsServer.on('request', function(request) {

  // Accept request
  let connection = request.accept(null, request.origin);

  // If gzserver is not connected just send material scripts and status
  if (!gzNode.getIsGzServerConnected())
  {
    // create error status and send it
    let statusMessage =
        '{"op":"publish","topic":"~/status","msg":{"status":"error"}}';
    connection.sendUTF(statusMessage);
    // send material scripts message
    connection.sendUTF(materialScriptsMessage);
    return;
  }

  connections.push(connection);

  if (!isConnected)
  {
    isConnected = true;
    gzNode.setConnected(isConnected);
  }

  console.log(new Date() + ' New connection accepted from: ' + request.origin +
      ' ' + connection.remoteAddress);

  // Handle messages received from client
  connection.on('message', function(message) {
    if (message.type === 'utf8') {
      console.log(new Date() + ' Received Message: ' + message.utf8Data +
          ' from ' + request.origin + ' ' + connection.remoteAddress);
      gzNode.request(message.utf8Data);
    }
    else if (message.type === 'binary') {
      console.log(new Date() + ' Received Binary Message of ' +
          message.binaryData.length + ' bytes from ' + request.origin + ' ' +
          connection.remoteAddress);
      connection.sendBytes(message.binaryData);
    }
  });

  // Handle client disconnection
  connection.on('close', function(reasonCode, description) {
    console.log(new Date() + ' Peer ' + request.origin + ' ' +
        connection.remoteAddress + ' disconnected.');

    // remove connection from array
    let conIndex = connections.indexOf(connection);
    connections.splice(conIndex, 1);

    // if there is no connection notify server that there is no connected client
    if (connections.length === 0) {
      isConnected = false;
      gzNode.setConnected(isConnected);
    }
  });
});

// If not connected, periodically send messages
if (gzNode.getIsGzServerConnected())
{
  setInterval(update, 10);

  function update()
  {
    if (connections.length > 0)
    {
      let msgs = gzNode.getMessages();
      for (let i = 0; i < connections.length; ++i)
      {
        for (let j = 0; j < msgs.length; ++j)
        {
          connections[i].sendUTF(msgs[j]);
        }
      }
    }
  }
}
