// StarOrbi Server v4.0.0 - Complete standalone
const http=require("http"),fs=require("fs"),path=require("path"),bcrypt=require("bcryptjs"),{v4:uuid}=require("uuid");
const PORT=process.env.PORT||3000,DB=path.join(__dirname,"db.json");
let db={users:[],cdks:[]};
try{if(fs.existsSync(DB))db=JSON.parse(fs.readFileSync(DB,"utf8"))}catch(e){}
function save(){try{fs.writeFileSync(DB,JSON.stringify(db,null,2),"utf8")}catch(e){console.log(e)}}

// Setup super admin
if(!db.users.find(u=>u.email==="1204892152@qq.com")){
  db.users.push({id:"super-admin",email:"1204892152@qq.com",username:"StarAdmin",passwordHash:bcrypt.hashSync("admin123",10),role:"admin",banned:false,orbiCoins:99999,memberUntil:null,permanentMember:true,growth:999999,createdAt:new Date().toISOString()});
  save();
}
// Restore helper functions
db.users.forEach(u=>{if(!u.orbiCoins)u.orbiCoins=0;if(!u.growth)u.growth=0});

http.createServer(async function(req,res){
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin","*");
  if(req.method==="OPTIONS"){res.writeHead(200);res.end();return}
  
  var url=req.url.split("?")[0],body="";
  req.on("data",c=>body+=c);
  req.on("end",function(){
    var p={};try{if(body)p=JSON.parse(body)}catch(e){}
    var r={error:"Unknown: "+url};
    
    if(url==="/api/health")r={status:"ok",version:"4.0.0",users:db.users.length,cdks:db.cdks.length,time:new Date().toISOString()};
    else if(url==="/api/users-list"){
      r={success:true,users:db.users.map(u=>({id:u.id,email:u.email,username:u.username,role:u.role,orbiCoins:u.orbiCoins||0,memberUntil:u.memberUntil,permanentMember:u.permanentMember||false,growth:u.growth||0,banned:u.banned,createdAt:u.createdAt}))};
    }
    else if(url==="/api/sync-user"&&req.method==="POST"){
      var eu=db.users.find(u=>u.email===p.email);
      if(eu){
        if(p.orbiCoins!==undefined)eu.orbiCoins=p.orbiCoins;
        if(p.memberUntil!==undefined)eu.memberUntil=p.memberUntil;
        if(p.permanentMember!==undefined)eu.permanentMember=p.permanentMember;
        if(p.growth!==undefined)eu.growth=p.growth;save();
        r={success:true,message:"Synced(updated)",user:{id:eu.id,email:eu.email,username:eu.username,role:eu.role}};
      }else if(p.email&&p.email.includes("@")){
        var nu={id:p.id||uuid(),email:p.email,username:p.username||p.email,passwordHash:p.passwordHash||bcrypt.hashSync("synced",10),role:p.role||"user",banned:false,orbiCoins:p.orbiCoins||0,memberUntil:p.memberUntil||null,permanentMember:p.permanentMember||false,growth:p.growth||0,createdAt:new Date().toISOString()};
        db.users.push(nu);save();
        r={success:true,message:"Synced(new)",user:{id:nu.id,email:nu.email,username:nu.username}};
      }else r={success:false,error:"Invalid email"};
    }
    else if(url==="/api/register"&&req.method==="POST"){
      if(!p.email||!p.password||p.password.length<6)r={success:false,error:"请填写完整信息"};
      else if(db.users.find(u=>u.email===p.email))r={success:false,error:"该邮箱已注册"};
      else{var isA=p.email==="1204892152@qq.com";
        var nid=uuid();db.users.push({id:nid,email:p.email,username:p.username||p.email,passwordHash:bcrypt.hashSync(p.password,10),role:isA?"admin":"user",banned:false,orbiCoins:50,memberUntil:isA?null:new Date(Date.now()+3*86400000).toISOString(),permanentMember:isA,growth:isA?999999:0,createdAt:new Date().toISOString()});
        save();r={success:true,user:{id:nid,email:p.email,username:p.username,role:isA?"admin":"user"}};
      }
    }
    else if(url==="/api/login"&&req.method==="POST"){
      var lu=db.users.find(u=>u.email===p.email);
      if(!lu)r={success:false,error:"账号不存在"};
      else if(lu.banned)r={success:false,error:"账号已封禁"};
      else if(!bcrypt.compareSync(p.password,lu.passwordHash))r={success:false,error:"密码错误"};
      else{
        if(p.email==="1204892152@qq.com"){lu.role="admin";lu.permanentMember=true;lu.orbiCoins=99999;lu.growth=999999;save()}
        r={success:true,user:{id:lu.id,email:lu.email,username:lu.username,role:lu.role,orbiCoins:lu.orbiCoins||0,memberUntil:lu.memberUntil,permanentMember:lu.permanentMember||false,growth:lu.growth||0}};
      }
    }
    else if(url==="/api/add-coins"&&req.method==="POST"){
      var au=db.users.find(u=>u.id===p.userId||u.email===p.email);
      if(!au)r={success:false,error:"用户不存在"};
      else{var a=parseInt(p.amount)||0;au.orbiCoins=(au.orbiCoins||0)+a;au.growth=(au.growth||0)+Math.abs(a);save();r={success:true,balance:au.orbiCoins,username:au.username}};
    }
    else if(url==="/api/deduct-coins"&&req.method==="POST"){
      var du=db.users.find(u=>u.id===p.userId||u.email===p.email);
      var a=parseInt(p.amount)||0;
      if(!du)r={success:false,error:"用户不存在"};
      else if((du.orbiCoins||0)<a)r={success:false,error:"余额不足"};
      else{du.orbiCoins-=a;save();r={success:true,balance:du.orbiCoins}};
    }
    else if(url==="/api/buy-membership"&&req.method==="POST"){
      var bu=db.users.find(u=>u.id===p.userId||u.email===p.email);
      if(!bu)r={success:false,error:"用户不存在"};
      else{var plans=[{d:30,c:300,l:"月费会员",g:300},{d:365,c:3000,l:"年费会员",g:3600},{d:-1,c:19821220,l:"永久会员",g:999999}];
        var pl=plans[p.planIndex];
        if(!pl)r={success:false,error:"无效套餐"};
        else if((bu.orbiCoins||0)<pl.c)r={success:false,error:"Orbi币不足"};
        else{bu.orbiCoins-=pl.c;bu.growth=(bu.growth||0)+pl.g;
          if(pl.d===-1)bu.permanentMember=true;
          else{var n=new Date(),b=bu.memberUntil&&new Date(bu.memberUntil)>n?new Date(bu.memberUntil):n;b.setDate(b.getDate()+pl.d);bu.memberUntil=b.toISOString()}
          save();r={success:true,balance:bu.orbiCoins,plan:pl.l,memberUntil:bu.memberUntil}};
      }
    }
    else if(url==="/api/ban"&&req.method==="POST"){
      var bn=db.users.find(u=>u.id===p.userId||u.email===p.email);
      if(bn){bn.banned=true;bn.banReason=p.reason||"违规";save();r={success:true}}else r={success:false,error:"用户不存在"};
    }
    else if(url==="/api/unban"&&req.method==="POST"){
      var ub=db.users.find(u=>u.id===p.userId||u.email===p.email);
      if(ub){ub.banned=false;save();r={success:true}}else r={success:false,error:"用户不存在"};
    }
    else if(url==="/api/set-permanent"&&req.method==="POST"){
      var sp=db.users.find(u=>u.id===p.userId||u.email===p.email);
      if(sp){sp.permanentMember=true;sp.growth=(sp.growth||0)+999999;save();r={success:true}}else r={success:false,error:"用户不存在"};
    }
    else if(url==="/api/promote"&&req.method==="POST"){
      var pr=db.users.find(u=>u.id===p.userId||u.email===p.email);
      if(pr){pr.role="admin";pr.growth=999999;pr.permanentMember=true;save();r={success:true}}else r={success:false,error:"用户不存在"};
    }
    else if(url==="/api/demote"&&req.method==="POST"){
      var dm=db.users.find(u=>u.id===p.userId||u.email===p.email);
      if(dm&&dm.email!=="1204892152@qq.com"){dm.role="user";save();r={success:true}}else r={success:false,error:dm?"不能降级超管":"用户不存在"};
    }
    else if(url==="/api/delete-user"&&req.method==="POST"){
      var dl=db.users.find(u=>u.id===p.userId||u.email===p.email);
      if(dl&&dl.email!=="1204892152@qq.com"){db.users=db.users.filter(u=>u.email!==dl.email);save();r={success:true}}else r={success:false,error:"不能删除"};
    }
    else if(url==="/api/generate-cdk"&&req.method==="POST"){
      var C="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",cdks=[];
      for(var i=0;i<(p.count||1);i++){var cd="SB-";for(var j=0;j<4;j++){for(var k=0;k<4;k++)cd+=C[Math.floor(Math.random()*C.length)];if(j<3)cd+="-"}cdks.push({code:cd,type:p.type||"coins",value:p.value||10,label:p.label,days:p.days||0,used:false,usedBy:null,usedAt:null,createdAt:new Date().toISOString()})}
      db.cdks=db.cdks.concat(cdks);save();r={success:true,cdks:cdks};
    }
    else if(url==="/api/redeem-cdk"&&req.method==="POST"){
      var cdk=db.cdks.find(c=>c.code===String(p.code).toUpperCase());
      if(!cdk)r={success:false,error:"CDK不存在"};else if(cdk.used)r={success:false,error:"CDK已使用"};
      else{var ru=db.users.find(u=>u.id===p.userId||u.email===p.email);
        if(!ru)r={success:false,error:"用户不存在"};
        else{cdk.used=true;cdk.usedBy=ru.email;cdk.usedAt=new Date().toISOString();ru.orbiCoins=(ru.orbiCoins||0)+(cdk.value||0);ru.growth=(ru.growth||0)+(cdk.value||0);save();r={success:true,message:"兑换成功",balance:ru.orbiCoins}};
      }
    }
    else if(url==="/api/recharge"&&req.method==="POST"){
      var rc=db.users.find(u=>u.id===p.userId||u.email===p.email);
      if(!rc)r={success:false,error:"用户不存在"};
      else{var pls={"1yuan":10,"10yuan":100,"50yuan":1000};var c=pls[p.plan]||parseInt(p.customAmount)||0;
        if(c<=0)r={success:false,error:"无效金额"};else{rc.orbiCoins=(rc.orbiCoins||0)+c;rc.growth=(rc.growth||0)+c;save();r={success:true,added:c,balance:rc.orbiCoins}};
      }
    }
    else if(url==="/api/cdk-list")r=db.cdks;
    else if(url==="/api/config")r=db.config||{};
    res.writeHead(200);res.end(JSON.stringify(r));
  });
}).listen(PORT,function(){console.log("StarOrbi v4.0.0 :"+PORT)});
