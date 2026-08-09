const http=require("http"),fs=require("fs"),path=require("path"),bcrypt=require("bcryptjs"),{v4:uuid}=require("uuid");
const PORT=process.env.PORT||3000,DB_FILE=path.join(__dirname,"data","database.json");
let db={users:[],cdks:[],admins:[],config:{version:"4.0.0"}};
function loadDb(){try{if(fs.existsSync(DB_FILE))db=JSON.parse(fs.readFileSync(DB_FILE,"utf8"))}catch(e){db={users:[],cdks:[],admins:[],config:{}}}if(!db.users)db.users=[];if(!db.cdks)db.cdks=[];if(!db.admins)db.admins=[];}
function saveDb(){try{var d=path.dirname(DB_FILE);if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true});fs.writeFileSync(DB_FILE,JSON.stringify(db,null,2),"utf8")}catch(e){console.log("Save err:",e.message)}}
loadDb();

http.createServer(function(req,res){
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type,x-api-key");
  if(req.method==="OPTIONS"){res.writeHead(200);res.end();return}
  var url=req.url.split("?")[0],body="";
  req.on("data",function(c){body+=c});
  req.on("end",function(){
    try{var p={};if(body)try{p=JSON.parse(body)}catch(e){}}
    catch(e){p={}}
    var r={error:"Unknown endpoint"};
    if(url==="/api/health")r={status:"ok",version:"4.0.0",users:db.users.length,time:new Date().toISOString()};
    else if(url==="/api/users-list"){var users=db.users.map(function(u){return{id:u.id,email:u.email,username:u.username,role:u.role,orbiCoins:u.orbiCoins||0,memberUntil:u.memberUntil,permanentMember:u.permanentMember||false,growth:u.growth||0,isAnnualVip:u.isAnnualVip||false,banned:u.banned,createdAt:u.createdAt}});r={success:true,users:users};}
    else if(url==="/api/sync-user"&&req.method==="POST"){
      if(!p.email||p.email.indexOf("@")<0){r={success:false,error:"Invalid email"}}
      else{var eu=db.users.find(function(u){return u.email===p.email});
        if(eu){if(p.orbiCoins!==undefined)eu.orbiCoins=p.orbiCoins;if(p.memberUntil!==undefined)eu.memberUntil=p.memberUntil;if(p.permanentMember!==undefined)eu.permanentMember=p.permanentMember;if(p.growth!==undefined)eu.growth=p.growth;if(p.isAnnualVip!==undefined)eu.isAnnualVip=p.isAnnualVip;saveDb();r={success:true,message:"Updated",user:{id:eu.id,email:eu.email,username:eu.username,role:eu.role}}}
        else{var nid=p.id||uuid();db.users.push({id:nid,email:p.email,username:p.username||p.email,passwordHash:p.passwordHash||"",role:p.email==="1204892152@qq.com"?"admin":(p.role||"user"),banned:false,orbiCoins:p.orbiCoins||0,memberUntil:p.memberUntil||null,permanentMember:p.permanentMember||false,growth:p.growth||0,isAnnualVip:p.isAnnualVip||false,createdAt:new Date().toISOString()});saveDb();r={success:true,message:"Created",user:{id:nid,email:p.email,username:p.username}}}
      }
    }
    else if(url==="/api/add-coins"&&req.method==="POST"){
      var au=db.users.find(function(u){return u.id===p.userId||u.email===p.email||u.username===p.username});
      if(!au)r={success:false,error:"用户不存在"};
      else{au.orbiCoins=(au.orbiCoins||0)+(parseInt(p.amount)||0);au.growth=(au.growth||0)+Math.abs(parseInt(p.amount)||0);saveDb();r={success:true,balance:au.orbiCoins,username:au.username}}
    }
    else if(url==="/api/deduct-coins"&&req.method==="POST"){
      var du=db.users.find(function(u){return u.id===p.userId||u.email===p.email||u.username===p.username});
      if(!du)r={success:false,error:"用户不存在"};
      else if((du.orbiCoins||0)<(parseInt(p.amount)||0))r={success:false,error:"余额不足"};
      else{du.orbiCoins-=(parseInt(p.amount)||0);saveDb();r={success:true,balance:du.orbiCoins}}
    }
    else if(url==="/api/buy-membership"&&req.method==="POST"){
      var bu=db.users.find(function(u){return u.id===p.userId||u.email===p.email});
      if(!bu)r={success:false,error:"用户不存在"};
      else{var plans=[{days:30,cost:300,label:"月费会员",growth:300},{days:365,cost:3000,label:"年费会员",growth:3600},{days:-1,cost:19821220,label:"永久会员",growth:999999}];
        var plan=plans[p.planIndex];if(!plan)r={success:false,error:"无效套餐"};
        else if((bu.orbiCoins||0)<plan.cost)r={success:false,error:"Orbi币不足"};
        else{bu.orbiCoins-=plan.cost;bu.growth=(bu.growth||0)+plan.growth;
          if(plan.days===-1){bu.permanentMember=true;bu.memberUntil=null}
          else{var now=new Date();var base=(bu.memberUntil&&new Date(bu.memberUntil)>now)?new Date(bu.memberUntil):now;base.setDate(base.getDate()+plan.days);bu.memberUntil=base.toISOString()}
          saveDb();r={success:true,balance:bu.orbiCoins,plan:plan.label,memberUntil:bu.memberUntil}
        }
      }
    }
    else if(url==="/api/ban"&&req.method==="POST"){
      var bnu=db.users.find(function(u){return u.id===p.userId||u.email===p.email});
      if(bnu){bnu.banned=true;bnu.banReason=p.reason||"违反使用条款";saveDb();r={success:true}}else r={success:false,error:"用户不存在"}
    }
    else if(url==="/api/unban"&&req.method==="POST"){
      var ubu=db.users.find(function(u){return u.id===p.userId||u.email===p.email});
      if(ubu){ubu.banned=false;saveDb();r={success:true}}else r={success:false,error:"用户不存在"}
    }
    else if(url==="/api/set-permanent"&&req.method==="POST"){
      var spu=db.users.find(function(u){return u.id===p.userId||u.email===p.email});
      if(spu){spu.permanentMember=true;spu.growth=(spu.growth||0)+999999;saveDb();r={success:true}}else r={success:false,error:"用户不存在"}
    }
    else if(url==="/api/remove-permanent"&&req.method==="POST"){
      var rpu=db.users.find(function(u){return u.id===p.userId||u.email===p.email});
      if(rpu){rpu.permanentMember=false;saveDb();r={success:true}}else r={success:false,error:"用户不存在"}
    }
    else if(url==="/api/promote"&&req.method==="POST"){
      var pru=db.users.find(function(u){return u.id===p.userId||u.email===p.email});
      if(pru){pru.role="admin";pru.growth=999999;pru.permanentMember=true;saveDb();r={success:true}}else r={success:false,error:"用户不存在"}
    }
    else if(url==="/api/demote"&&req.method==="POST"){
      var dmu=db.users.find(function(u){return u.id===p.userId||u.email===p.email});
      if(dmu&&dmu.email!=="1204892152@qq.com"){dmu.role="user";saveDb();r={success:true}}else r={success:false,error:dmu?"不能降级超级管理员":"用户不存在"}
    }
    else if(url==="/api/recharge"&&req.method==="POST"){
      var rcu=db.users.find(function(u){return u.id===p.userId||u.email===p.email});
      if(!rcu)r={success:false,error:"用户不存在"};
      else{var plans={"1yuan":10,"10yuan":100,"50yuan":1000};var c=plans[p.plan]||parseInt(p.customAmount)||0;
        if(c<=0)r={success:false,error:"无效金额"};else{rcu.orbiCoins=(rcu.orbiCoins||0)+c;rcu.growth=(rcu.growth||0)+c;saveDb();r={success:true,added:c,balance:rcu.orbiCoins}}
      }
    }
    else if(url==="/api/generate-cdk"&&req.method==="POST"){
      var codes="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",cdks=[];
      for(var i=0;i<(p.count||1);i++){var code="SB-";for(var j=0;j<4;j++){for(var k=0;k<4;k++)code+=codes[Math.floor(Math.random()*codes.length)];if(j<3)code+="-"}cdks.push({code:code,type:p.type||"coins",value:p.value||10,label:p.label,days:p.days||0,used:false,usedBy:null,usedAt:null,createdAt:new Date().toISOString()})}
      db.cdks=db.cdks.concat(cdks);saveDb();r={success:true,cdks:cdks}
    }
    else if(url==="/api/redeem-cdk"&&req.method==="POST"){
      var cdk=db.cdks.find(function(c){return c.code===String(p.code).toUpperCase()});
      if(!cdk)r={success:false,error:"CDK不存在"};else if(cdk.used)r={success:false,error:"CDK已被使用"};
      else{var ru=db.users.find(function(u){return u.id===p.userId||u.email===p.email});
        if(!ru)r={success:false,error:"用户不存在"};else{cdk.used=true;cdk.usedBy=ru.email;cdk.usedAt=new Date().toISOString();ru.orbiCoins=(ru.orbiCoins||0)+(cdk.value||0);ru.growth=(ru.growth||0)+(cdk.value||0);saveDb();r={success:true,message:"兑换成功",balance:ru.orbiCoins}}
      }
    }
    else if(url==="/api/register"&&req.method==="POST"){
      if(!p.email||!p.password||p.password.length<6)r={success:false,error:"参数不完整"};
      else if(db.users.find(function(u){return u.email===p.email}))r={success:false,error:"该邮箱已注册"};
      else{var nid=uuid();var isAdmin=p.email.toLowerCase()==="1204892152@qq.com";
        db.users.push({id:nid,email:p.email,username:p.username||p.email,passwordHash:bcrypt.hashSync(p.password,10),role:isAdmin?"admin":"user",banned:false,orbiCoins:50,memberUntil:isAdmin?null:new Date(Date.now()+3*86400000).toISOString(),permanentMember:isAdmin,growth:isAdmin?999999:0,isAnnualVip:isAdmin,createdAt:new Date().toISOString()});
        saveDb();r={success:true,user:{id:nid,email:p.email,username:p.username,role:isAdmin?"admin":"user"}}
      }
    }
    else if(url==="/api/login"&&req.method==="POST"){
      var lu=db.users.find(function(u){return u.email===p.email});
      if(!lu)r={success:false,error:"账号不存在"};
      else if(lu.banned)r={success:false,error:"账号已封禁"};
      else if(!bcrypt.compareSync(p.password,lu.passwordHash))r={success:false,error:"密码错误"};
      else{
        if(p.email==="1204892152@qq.com"){lu.role="admin";lu.permanentMember=true;lu.orbiCoins=Math.max(lu.orbiCoins||0,99999);lu.growth=999999;saveDb()}
        r={success:true,user:{id:lu.id,email:lu.email,username:lu.username,role:lu.role,orbiCoins:lu.orbiCoins||0,memberUntil:lu.memberUntil,permanentMember:lu.permanentMember||false}}
      }
    }
    else if(url==="/api/delete-user"&&req.method==="POST"){
      var du=db.users.find(function(u){return u.id===p.userId||u.email===p.email});
      if(du&&du.email!=="1204892152@qq.com"){db.users=db.users.filter(function(u){return u.email!==du.email});saveDb();r={success:true}}else r={success:false,error:"不能删除超级管理员"}
    }
    else if(url==="/api/config")r=db.config;
    else if(url==="/api/cdk-list")r=db.cdks;
    res.writeHead(200);res.end(JSON.stringify(r));
  });
}).listen(PORT,function(){console.log("StarOrbi Server v4.0.0 on http://localhost:"+PORT)});
