const http = require('http');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const nodemailer = require('nodemailer');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'database.json');
const SUPER_ADMIN = '1204892152@qq.com';
const API_KEY = 'starorbi-admin-2024';
const VERSION = '4.0.0'; // Build: 20260809-163422

let db = { users: [], cdks: [], admins: [], config: { version: VERSION, smtpHost: 'smtp.qq.com', smtpPort: 465, smtpUser: '', smtpPass: '', smtpFrom: '' } };
let verificationCodes = new Map();
// SSE real-time push
let sseClients = new Map();
function sseSend(userId, event, data) {
  var clients = sseClients.get(userId);
  if (!clients) return;
  var payload = 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n';
  clients.forEach(function(res) { try { res.write(payload); } catch(e) {} });
}
function sseBroadcast(event, data) {
  var payload = 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n';
  sseClients.forEach(function(clients) { clients.forEach(function(res) { try { res.write(payload); } catch(e) {} }); });
}

// Load database
function loadDb() {
  try { if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch(e) { console.error('DB load error:', e); }
  if (!db.users) db.users = [];
  if (!db.cdks) db.cdks = [];
  if (!db.admins) db.admins = [];
  if (!db.config) db.config = { version: VERSION, smtpHost: 'smtp.qq.com', smtpPort: 465, smtpUser: '', smtpPass: '', smtpFrom: '' };
  if (db.admins.length === 0) db.admins.push({ id: uuid(), username: 'superadmin', passwordHash: bcrypt.hashSync('admin123', 10), email: SUPER_ADMIN });
  saveDb();
}

function saveDb() {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8'); } catch(e) { console.error('DB save error:', e); }
}

// Email helpers
function getEmailType(email) {
  if (email.endsWith('@qq.com')) return 'QQ邮箱';
  if (email.endsWith('@163.com') || email.endsWith('@126.com') || email.endsWith('@yeah.net')) return '网易邮箱';
  if (email.endsWith('@gmail.com')) return '谷歌邮箱';
  return null;
}

async function sendVerificationCode(email) {
  var code = String(Math.floor(100000 + Math.random() * 900000));
  verificationCodes.set(email, { code: code, expires: Date.now() + 5 * 60 * 1000 });
  var config = db.config;
  if (!config.smtpUser || !config.smtpPass) {
    console.log('[DEV] Code for ' + email + ': ' + code);
    return { success: true, message: '验证码: ' + code + ' (DEV模式)', devCode: code };
  }
  try {
    var transporter = nodemailer.createTransport({ host: config.smtpHost, port: config.smtpPort, secure: true, auth: { user: config.smtpUser, pass: config.smtpPass } });
    await transporter.sendMail({ from: config.smtpFrom || config.smtpUser, to: email, subject: 'StarOrbi - 验证码', text: '验证码: ' + code + ' 5分钟有效', html: '<div style="padding:20px"><h2 style="color:#667eea">StarOrbi 星轨音乐</h2><p>验证码:</p><div style="font-size:32px;font-weight:bold;color:#667eea;letter-spacing:8px;padding:16px;background:#f5f5ff;border-radius:12px;text-align:center">' + code + '</div><p style="color:#999">5分钟内有效</p></div>' });
    return { success: true, message: '验证码已发送至 ' + email };
  } catch(e) { return { success: false, error: '发送失败: ' + e.message }; }
}

function verifyCode(email, code) {
  var record = verificationCodes.get(email);
  if (!record) return { success: false, error: '请先获取验证码' };
  if (Date.now() > record.expires) { verificationCodes.delete(email); return { success: false, error: '验证码已过期' }; }
  if (record.code !== code) return { success: false, error: '验证码错误' };
  verificationCodes.delete(email);
  return { success: true };
}

// CDK helpers
function generateCdkCode() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code = 'SB-';
  for (var i = 0; i < 4; i++) {
    for (var j = 0; j < 4; j++) code += chars[Math.floor(Math.random() * chars.length)];
    if (i < 3) code += '-';
  }
  return code;
}

// HTTP request body parser
function parseBody(req) {
  return new Promise(function(resolve) {
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
      try { resolve(JSON.parse(body)); } catch(e) {
        try { var params = {}; new URLSearchParams(body).forEach(function(v,k){ params[k]=v; }); resolve(params); } catch(e2) { resolve({}); }
      }
    });
  });
}

// Main server
var server = http.createServer(async function(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  var url = req.url.split('?')[0];
  var ADMIN_ENDPOINTS = ['/api/users','/api/ban','/api/unban','/api/add-coins','/api/deduct-coins','/api/set-permanent','/api/remove-permanent','/api/promote','/api/demote','/api/delete-user','/api/recharge','/api/generate-cdk','/api/cdk-list','/api/update-config','/api/users-list'];
  if (ADMIN_ENDPOINTS.indexOf(url) >= 0 && req.headers['x-api-key'] !== API_KEY) {
    res.writeHead(403);
    res.end(JSON.stringify({error: 'Invalid API key'}));
    return;
  }
  var query = {};
  if (req.url.indexOf('?') > -1) { new URLSearchParams(req.url.split('?')[1]).forEach(function(v,k){ query[k]=v; }); }
  var body = req.method === 'POST' ? await parseBody(req) : {};

  try {
    var result = { error: 'Unknown endpoint' };

    // ===== SSE REAL-TIME STREAM =====
    if (url === '/api/sync/stream') {
      var uid = query.userId;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write('event: connected\ndata: {"status":"ok"}\n\n');
      if (!sseClients.has(uid)) sseClients.set(uid, []);
      sseClients.get(uid).push(res);
      req.on('close', function() {
        var arr = sseClients.get(uid);
        if (arr) { var idx = arr.indexOf(res); if (idx >= 0) arr.splice(idx, 1); if (arr.length === 0) sseClients.delete(uid); }
      });
      return;
    }
    // ===== HEALTH =====
    else if (url === '/api/health') {
      result = { status: 'ok', version: VERSION, users: db.users.length, cdks: db.cdks.length, time: new Date().toISOString() };
    }
    else if (url === '/api/users-list') {
      if (req.headers['x-api-key'] !== API_KEY) { res.writeHead(403); res.end(JSON.stringify({error: 'API密钥无效'})); return; }
      result = { success: true, users: db.users.map(function(u){ return { id: u.id, email: u.email, emailType: u.emailType, username: u.username, role: u.role, orbiCoins: u.orbiCoins||0, memberUntil: u.memberUntil, permanentMember: u.permanentMember||false, growth: u.growth||0, isAnnualVip: u.isAnnualVip||false, banned: u.banned, createdAt: u.createdAt }; }) };
    }
    // ===== AUTH =====
    else if (url === '/api/send-code' && req.method === 'POST') {
      if (!body.email) { result = { success: false, error: '请输入邮箱' }; }
      else if (!getEmailType(body.email)) { result = { success: false, error: '仅支持QQ/网易/谷歌邮箱' }; }
      else if (db.users.find(function(u){return u.email===body.email;})) { result = { success: false, error: '该邮箱已注册' }; }
      else { result = await sendVerificationCode(body.email); }
    }
    else if (url === '/api/register' && req.method === 'POST') {
      var emailType = getEmailType(body.email);
      if (!emailType) { result = { success: false, error: '仅支持QQ/网易/谷歌邮箱' }; }
      else if (db.users.find(function(u){return u.email===body.email;})) { result = { success: false, error: '该邮箱已注册' }; }
      else if (!body.username || body.username.length < 2) { result = { success: false, error: '用户名至少2字符' }; }
      else if (!body.password || body.password.length < 6) { result = { success: false, error: '密码至少6位' }; }
      else if (!body.code) { result = { success: false, error: '请输入验证码' }; }
      else {
        var vr = verifyCode(body.email, body.code);
        if (!vr.success) { result = vr; }
        else {
          var id = uuid();
          var isAdmin = body.email.toLowerCase() === SUPER_ADMIN;
          db.users.push({ id: id, email: body.email, emailType: emailType, username: body.username, passwordHash: bcrypt.hashSync(body.password, 10), role: isAdmin ? 'admin' : 'user', banned: false, banReason: '', orbiCoins: 50, memberUntil: null, permanentMember: false, createdAt: new Date().toISOString() });
          saveDb();
          result = { success: true, user: { id: id, email: body.email, username: body.username, emailType: emailType, role: isAdmin ? 'admin' : 'user', orbiCoins: 50 } };
        }
      }
    }
    // ===== SYNC USER (client pushes registration/login to server) =====
    else if (url === '/api/sync-user' && req.method === 'POST') {
      if (!body.email || body.email === 'synced@server' || body.email.indexOf('@') < 0) {
        result = { success: false, error: 'Invalid email for sync' };
      } else {
        var existing = db.users.find(function(u){return u.email===body.email;});
        if (existing) {
          if (body.orbiCoins !== undefined) existing.orbiCoins = body.orbiCoins;
          if (body.permanentMember !== undefined) existing.permanentMember = body.permanentMember;
          if (body.memberUntil !== undefined) existing.memberUntil = body.memberUntil;
          if (body.growth !== undefined) existing.growth = body.growth;
          if (body.isAnnualVip !== undefined) existing.isAnnualVip = body.isAnnualVip;
          saveDb();
          sseSend(existing.id, 'refresh', {orbiCoins:existing.orbiCoins,memberUntil:existing.memberUntil,permanentMember:existing.permanentMember});
          result = { success: true, message: 'User synced (updated)', user: { id: existing.id, email: existing.email, username: existing.username, role: existing.role, orbiCoins: existing.orbiCoins||0, memberUntil: existing.memberUntil, permanentMember: existing.permanentMember||false } };
        } else {
          var id = body.id || uuid();
          var uname = body.username || body.email;
          db.users.push({ id: id, email: body.email, emailType: body.emailType||'', username: uname, passwordHash: body.passwordHash||'', role: body.role||'user', banned: false, banReason: '', orbiCoins: body.orbiCoins||0, memberUntil: body.memberUntil||null, permanentMember: body.permanentMember||false, growth: body.growth||0, isAnnualVip: body.isAnnualVip||false, createdAt: new Date().toISOString() });
          saveDb();
          console.log('[Sync] New user synced from client: ' + body.email);
          result = { success: true, message: 'User synced (created)', user: { id: id, email: body.email, username: uname, role: body.role||'user', orbiCoins: body.orbiCoins||0 } };
        }
      }
    }
    else if (url === '/api/login' && req.method === 'POST') {
      var admin = db.admins.find(function(a){return a.username===body.email;});
      if (admin) {
        if (!bcrypt.compareSync(body.password, admin.passwordHash)) { result = { success: false, error: '密码错误' }; }
        else { result = { success: true, user: { id: admin.id, email: admin.email || 'admin', username: admin.username, role: 'admin', orbiCoins: 99999 } }; }
      } else {
        var user = db.users.find(function(u){return u.email===body.email;});
        if (!user) { result = { success: false, error: '账号不存在' }; }
        else if (user.banned) { result = { success: false, error: '账号已被封禁: ' + (user.banReason || '') }; }
        else if (!bcrypt.compareSync(body.password, user.passwordHash)) { result = { success: false, error: '密码错误' }; }
        else {
          if (body.email.toLowerCase() === SUPER_ADMIN) { user.role = 'admin'; user.permanentMember = true; user.orbiCoins = 99999; user.growth = 999999; user.isAnnualVip = true; saveDb(); }
          result = { success: true, user: { id: user.id, email: user.email, username: user.username, emailType: user.emailType, role: user.role, orbiCoins: user.orbiCoins || 0, memberUntil: user.memberUntil, permanentMember: user.permanentMember } };
        }
      }
    }
    else if (url === '/api/reset-password' && req.method === 'POST') {
      var user = db.users.find(function(u){return u.email===body.email;});
      if (!user) { result = { success: false, error: '该邮箱未注册' }; }
      else if (!body.code) { result = { success: false, error: '请输入验证码' }; }
      else if (!body.newPassword || body.newPassword.length < 6) { result = { success: false, error: '新密码至少6位' }; }
      else {
        var vr = verifyCode(body.email, body.code);
        if (!vr.success) { result = vr; }
        else { user.passwordHash = bcrypt.hashSync(body.newPassword, 10); saveDb(); result = { success: true, message: '密码修改成功' }; }
      }
    }
    // ===== USER INFO =====
    else if (url === '/api/user-info' && req.method === 'POST') {
      var user = db.users.find(function(u){return u.id===body.userId || u.email===body.email;});
      if (!user) { result = { success: false, error: '用户不存在' }; }
      else { var isSA = user.email && user.email.toLowerCase() === SUPER_ADMIN;
        result = { success: true, user: { id: user.id, email: user.email, username: user.username, orbiCoins: isSA ? 99999 : (user.orbiCoins || 0), memberUntil: isSA ? null : user.memberUntil, permanentMember: isSA ? true : (user.permanentMember || false), banned: user.banned || false, role: isSA ? 'admin' : user.role, growth: isSA ? 999999 : (user.growth || 0), isAnnualVip: isSA ? true : (user.isAnnualVip || false) } }; }
    }
    // ===== ADMIN: LIST USERS =====
    else if (url === '/api/users') {
      result = db.users.map(function(u) {
        return { id: u.id, email: u.email, emailType: u.emailType, username: u.username, role: u.role, banned: u.banned, banReason: u.banReason, orbiCoins: u.orbiCoins || 0, memberUntil: u.memberUntil, permanentMember: u.permanentMember || false, createdAt: u.createdAt };
      });
    }
    // ===== ADMIN: BAN/UNBAN =====
    else if (url === '/api/ban' && req.method === 'POST') {
      var user = db.users.find(function(u){return u.id===body.userId || u.email===body.email;});
      if (user) { user.banned = true; user.banReason = body.reason || '违反使用条款'; saveDb(); result = { success: true }; }
      else { result = { success: false, error: '用户不存在' }; }
    }
    else if (url === '/api/unban' && req.method === 'POST') {
      var user = db.users.find(function(u){return u.id===body.userId || u.email===body.email;});
      if (user) { user.banned = false; user.banReason = ''; saveDb(); sseSend(user.id, 'refresh', {banned:false}); result = { success: true }; }
      else { result = { success: false, error: '用户不存在' }; }
    }
    // ===== ADMIN: COINS =====
    else if (url === '/api/add-coins' && req.method === 'POST') {
      var user = db.users.find(function(u){return u.id===body.userId || u.email===body.email || u.username===body.username;});
      if (!user) { result = { success: false, error: '用户不存在' }; }
      else { user.orbiCoins = (user.orbiCoins || 0) + (body.amount || 0); user.growth = (user.growth || 0) + Math.abs(body.amount || 0); saveDb(); sseSend(user.id, 'refresh', {orbiCoins:user.orbiCoins,username:user.username}); result = { success: true, balance: user.orbiCoins, username: user.username }; }
    }
    else if (url === '/api/deduct-coins' && req.method === 'POST') {
      var user = db.users.find(function(u){return u.id===body.userId || u.email===body.email || u.username===body.username;});
      if (!user) { result = { success: false, error: '用户不存在' }; }
      else if ((user.orbiCoins || 0) < (body.amount || 0)) { result = { success: false, error: '余额不足' }; }
      else { user.orbiCoins -= body.amount; saveDb(); sseSend(user.id, 'refresh', {orbiCoins:user.orbiCoins}); result = { success: true, balance: user.orbiCoins }; }
    }
    // ===== ADMIN: MEMBERSHIP =====
    else if (url === '/api/set-permanent' && req.method === 'POST') {
      var user = db.users.find(function(u){return u.id===body.userId || u.email===body.email;});
      if (user) { user.permanentMember = true; saveDb(); sseSend(user.id, 'refresh', {permanentMember:true}); result = { success: true }; }
      else { result = { success: false, error: '用户不存在' }; }
    }
    else if (url === '/api/remove-permanent' && req.method === 'POST') {
      var user = db.users.find(function(u){return u.id===body.userId || u.email===body.email;});
      if (user) { user.permanentMember = false; saveDb(); result = { success: true }; }
      else { result = { success: false, error: '用户不存在' }; }
    }
    else if (url === '/api/promote' && req.method === 'POST') {
      var user = db.users.find(function(u){return u.id===body.userId || u.email===body.email;});
      if (user) { user.role = 'admin'; user.growth = 999999; user.permanentMember = true; saveDb(); sseSend(user.id, 'refresh', {role:'admin'}); result = { success: true }; }
      else { result = { success: false, error: '用户不存在' }; }
    }
    else if (url === '/api/demote' && req.method === 'POST') {
      var user = db.users.find(function(u){return u.id===body.userId || u.email===body.email;});
      if (user && user.email !== SUPER_ADMIN) { user.role = 'user'; saveDb(); sseSend(user.id, 'refresh', {role:'user'}); result = { success: true }; }
      else { result = { success: false, error: user ? '不能降级超级管理员' : '用户不存在' }; }
    }
    else if (url === '/api/delete-user' && req.method === 'POST') {
      db.users = db.users.filter(function(u){return u.id!==body.userId;});
      saveDb(); result = { success: true };
    }
    // ===== RECHARGE =====
    else if (url === '/api/recharge' && req.method === 'POST') {
      var user = db.users.find(function(u){return u.id===body.userId || u.email===body.email;});
      if (!user) { result = { success: false, error: '用户不存在' }; }
      else {
        var plans = { '1yuan': 10, '10yuan': 100, '50yuan': 1000 };
        var coins = plans[body.plan] || parseInt(body.customAmount) || 0;
        if (coins <= 0) { result = { success: false, error: '无效充值金额' }; }
        else { user.orbiCoins = (user.orbiCoins || 0) + coins; user.growth = (user.growth || 0) + coins; saveDb(); sseSend(user.id, 'refresh', {orbiCoins:user.orbiCoins}); result = { success: true, added: coins, balance: user.orbiCoins }; }
      }
    }
    // ===== BUY MEMBERSHIP =====
    else if (url === '/api/buy-membership' && req.method === 'POST') {
      var user = db.users.find(function(u){return u.id===body.userId || u.email===body.email;});
      if (!user) { result = { success: false, error: '用户不存在' }; }
      else {
        var plans = [
          { days: 30, cost: 300, label: 'OrbiVIP 月费会员', growthBonus: 300, type: 'monthly' },
          { days: 365, cost: 3000, label: 'OrbiVIP 年费会员', growthBonus: 3600, type: 'annual' },
          { days: -1, cost: 19821220, label: '永久会员', growthBonus: 999999, type: 'permanent' }
        ];
        var plan = plans[body.planIndex];
        if (!plan) { result = { success: false, error: '无效套餐' }; }
        else if ((user.orbiCoins || 0) < plan.cost) { result = { success: false, error: 'Orbi币不足' }; }
        else {
          user.orbiCoins -= plan.cost;
          user.growth = (user.growth || 0) + (plan.growthBonus || 0);
          if (plan.type === 'annual') user.isAnnualVip = true;
          if (plan.days === -1) { user.permanentMember = true; user.growth = (user.growth || 0) + 999999; }
          else {
            var now = new Date();
            var base = (user.memberUntil && new Date(user.memberUntil) > now) ? new Date(user.memberUntil) : now;
            base.setDate(base.getDate() + plan.days);
            user.memberUntil = base.toISOString();
          }
          saveDb();
          sseSend(user.id, 'refresh', {orbiCoins:user.orbiCoins, memberUntil:user.memberUntil, permanentMember:user.permanentMember});
          result = { success: true, balance: user.orbiCoins, plan: plan.label, memberUntil: user.memberUntil, permanentMember: user.permanentMember };
        }
      }
    }
    // ===== CDK =====
    else if (url === '/api/generate-cdk' && req.method === 'POST') {
      var cdks = [];
      var count = body.count || 1;
      var type = body.type || 'coins'; // 'coins' or 'membership'
      var value = body.value || 10;
      var label = body.label || value + ' Orbi币';
      var days = body.days || 0;
      for (var i = 0; i < count; i++) {
        var cdk = { code: generateCdkCode(), type: type, value: value, label: label, days: days, used: false, usedBy: null, usedAt: null, createdAt: new Date().toISOString() };
        db.cdks.push(cdk);
        cdks.push(cdk);
      }
      saveDb();
      result = { success: true, cdks: cdks };
    }
    else if (url === '/api/redeem-cdk' && req.method === 'POST') {
      var cdk = db.cdks.find(function(c){return c.code===body.code;});
      if (!cdk) { result = { success: false, error: 'CDK不存在' }; }
      else if (cdk.used) { result = { success: false, error: 'CDK已被使用' }; }
      else {
        var user = db.users.find(function(u){return u.id===body.userId || u.email===body.email;});
        if (!user) { result = { success: false, error: '用户不存在' }; }
        else {
          cdk.used = true; cdk.usedBy = user.email; cdk.usedAt = new Date().toISOString();
          if (cdk.type === 'coins') {
            user.orbiCoins = (user.orbiCoins || 0) + cdk.value; user.growth = (user.growth || 0) + cdk.value;
            result = { success: true, message: '兑换成功! 获得 ' + cdk.value + ' Orbi币', balance: user.orbiCoins };
          } else if (cdk.type === 'membership') {
            if (cdk.days === -1) { user.permanentMember = true; result = { success: true, message: '兑换成功! 获得永久会员' }; }
            else {
              var now = new Date();
              var base = (user.memberUntil && new Date(user.memberUntil) > now) ? new Date(user.memberUntil) : now;
              base.setDate(base.getDate() + cdk.days);
              user.memberUntil = base.toISOString();
              result = { success: true, message: '兑换成功! 获得' + cdk.label, memberUntil: user.memberUntil };
            }
          }
          saveDb();
        }
      }
    }
    else if (url === '/api/cdk-list') {
      result = db.cdks;
    }
    // ===== CONFIG =====
    else if (url === '/api/config') {
      result = db.config;
    }
    else if (url === '/api/update-config' && req.method === 'POST') {
      Object.assign(db.config, body);
      saveDb();
      result = { success: true, config: db.config };
    }
    // ===== MEMBERSHIP PLANS =====
    else if (url === '/api/membership-plans') {
      result = [
        { index: 0, days: 30, cost: 300, label: 'OrbiVIP 月费会员', growthBonus: 300, type: 'monthly' },
        { index: 1, days: 365, cost: 3000, label: 'OrbiVIP 年费会员', growthBonus: 3600, type: 'annual' },
        { index: 2, days: -1, cost: 19821220, label: '永久会员', growthBonus: 999999, type: 'permanent' }
      ];
    }

    res.writeHead(200);
    res.end(JSON.stringify(result));
  } catch(e) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: e.message }));
  }
});

loadDb();
server.listen(PORT, function() {
  console.log('=================================');
  console.log('  StarOrbi Server v' + VERSION);
  console.log('  http://127.0.0.1:' + PORT);
  console.log('  Users: ' + db.users.length);
  console.log('  CDKs: ' + db.cdks.length);
  console.log('=================================');
});