var express = require('express');
var router = express.Router();
const { OAuth2Client } = require('google-auth-library')
const { google } = require("googleapis");
const nodeCron = require("node-cron");
const axios = require("axios")
const client = new OAuth2Client(process.env.MAIL_CLIENT_ID)
let nodemailer = require('nodemailer');
const OAuth2 = google.auth.OAuth2;

const oauth2Client = new OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);

oauth2Client.setCredentials({
  refresh_token: process.env.REFRESH_TOKEN
});

const { PrismaClient } = require('@prisma/client');
const { stringify } = require('jade/lib/utils');
const { Each } = require('jade/lib/nodes');
const prisma = new PrismaClient()
/* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index', { title: 'Express' });
});

router.post('/biometric',(req,res)=>{
  console.log(req.body)
  //store in db
  res.send({status:"done"})
})


router.use(async (req, res, next) => {
  const user = await prisma.user.findFirst({where: { id:  req.session.userId }})
  req.user = user
  next()
})

router.post('/login', async (req, res) => {
  const { token } = req.body
  const ticket = await client.verifyIdToken({
    idToken: token,
    audience: process.env.CLIENT_ID
  });
  const { name, email, image } = ticket.getPayload();
  const user = await prisma.user.upsert({
    where: { email: email },
    update: { name, image },
    create: { name, email, image }
  })


  req.session.userId = user.id
  res.status(201)
  console.log("USER",user)
  res.json(user)
})

router.post('/logout', (req, res) => {
  console.log("LOGOUT")
  console.log(req.session)
  res.status(200)
  res.json({
    message: "Logged out successfully"
  })
})



router.post('/addstocks', async (req, res) => {
  
  console.log(req.body.price,req.body.shares)
  const stocks = await prisma.stocks.create({
    data: {
      messariId: req.body.messariId,
      name: req.body.name,
      shares:parseFloat(req.body.shares),
      price:parseFloat(req.body.price),
      owner: {
        connect: { id: req.user.id }
      },

    }
  })
  console.log("Stock added in portfolio", stocks);
  res.status(200)
  res.json(
    stocks
  )
})

router.delete('/deletestock', async (req, res) => {
  // const portfolio = await prisma.portfolio.findUnique({where: { id:req.user.id}})
  const stocks = await prisma.stocks.delete({
    where: { id: req.body.id }
  })
  console.log("Stock added in portfolio", stocks);
  res.status(200)
  res.json(
    stocks
  )
})

router.post('/sendemail', async (req, res) => {


  //emailOptions - who sends what to whom
  const sendEmail = async (emailOptions) => {
    console.log("SEND EMAIL")
    let emailTransporter = await createTransporter();
    await emailTransporter.sendMail(emailOptions);
  };
  sendEmail({
    subject: "Test",
    text: "I am sending an email from nodemailer!",
    to: "anujduggal@hotmail.com",
    from: process.env.EMAIL
  });
  res.send(200)
}
)

const createTransporter = async () => {
  const oauth2Client = new OAuth2(
    process.env.MAIL_CLIENT_ID,
    process.env.MAIL_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.REFRESH_TOKEN
  });

  const accessToken = await new Promise((resolve, reject) => {
    oauth2Client.getAccessToken((err, token) => {
      if (err) {
        reject();
      }
      resolve(token);
    });
  });

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: process.env.EMAIL,
      accessToken,
      clientId: process.env.MAIL_CLIENT_ID,
      clientSecret: process.env.MAIL_CLIENT_SECRET,
      refreshToken: process.env.REFRESH_TOKEN
    }
  });

  return transporter;
};

const sendEmail = async (emailOptions) => {
  let emailTransporter = await createTransporter();
  await emailTransporter.sendMail(emailOptions);
};

router.get('/getstocks', async (req, res) => {
  if(req.user.id==null){
    res.status(401)
    res.send("user not found")
  }

  const stocks = await prisma.stocks.findMany({
    where: {
      owner: {
        id: req.user.id
      }
    }
  })
  
  let listOfStocks = stocks.map(x=>x.messariId)
  
  let list=[...new Set(listOfStocks)] //generating list of unique stock names to retrieve price from api
    
  try{
  let dataPromises = list.map((stock)=>{
    return axios.get('https://data.messari.io/api/v1/assets/' + stock + '/metrics/market-data')

  })
  let data = await Promise.all(dataPromises)
  for (let j=0;j<data.length; j++) {
    for(let i=0;i<stocks.length;i++){
      if(stocks[i].name == data[j].data.data.Asset.name){
        if(data[j].data.data.Asset.name==null){
          stocks[i].currentPrice=0;
        }
        else stocks[i].currentPrice = data[j].data.data.market_data.price_usd
      }
    }
  }
  
  res.send(stocks)
}catch (e) {
  console.log('caught error', e)
}
})


router.post('/mailoptions', async (req, res) => {

  let userCrypto = await prisma.stocks.findMany({
    where: {
      owner: {
        id: 1
      }
    }
  })
   axios.get('https://data.messari.io/api/v1/assets/btc/metrics/market-data')
   .then(result =>{
        console.log("INSIDE RATES",result.data.data.market_data.price_usd)
      sendEmail({
        subject: "Price Update",
        text: "Here's your crypto price update "+ result.data.data.market_data.price_usd,
        to: "",
        from: process.env.EMAIL
      });
      })
}
)


module.exports = router;