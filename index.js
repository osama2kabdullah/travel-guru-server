const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const jwt = require("jsonwebtoken");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.TRAVEL_ADMIN_NAME}:${process.env.DATABASE_PASS_KEY}@cluster0.qf4bw47.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

//verifyToken
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization;
  if (token.split(" ")[1] === "null") {
    return res
      .status(401)
      .send({ message: "Unauthorize access", success: false, code: 401 });
  }
  const tokenCode = token.split(" ")[1].replace('"', "").replace('"', "");
  jwt.verify(tokenCode, process.env.JSON_TOKEN, (err, decoded) => {
    if (err) {
      return res
        .status(403)
        .send({ message: "Forbidden access", success: false, code: 403 });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    client.connect();
    const places = client.db("travel-guru").collection("places");
    const users = client.db("travel-guru").collection("users");
    const bookings = client.db("travel-guru").collection("bookings");

    //get placces
    app.get("/palces", async (req, res) => {
      const result = await places.find().toArray();
      res.send(result);
    });

    //post a user
    app.put("/insertUser", async (req, res) => {
      const query = { email: req.body.email };
      const existUser = await users.findOne(query);
      let result = { insert: false };
      if (!existUser) {
        const update = { $set: req.body };
        const options = { upsert: true };
        result = await users.updateOne(query, update, options);
      }
      const token = jwt.sign(query, process.env.JSON_TOKEN, {
        expiresIn: "1d",
      });
      res.send({ token, result });
    });

    //get a place
    app.post("/getplace", verifyToken, async (req, res) => {
      const filter = req.body;
      const result = await places.findOne({ name: filter.toPlace });
      res.send({ ...result });
    });

    //validate user
    app.get("/validuser/:email", verifyToken, (req, res) => {
      req.decoded.email == req.params.email
        ? res.send({ valid: true })
        : res.send({ valid: false });
    });

    //get hotels
    app.get("/hotels/:placeName", verifyToken, async (req, res) => {
      const UserEmail = req.headers.authorization.split(" ")[2];
      const placename = req.params.placeName;
      if (req.decoded.email == UserEmail) {
        const user = await users.findOne({ email: UserEmail });
        if (user.bookings) {
          const match = user.bookings.filter(
            (book) => book.toPlace == placename
          );
          if (match.length < 0) {
            return res.send({success: true, message:'hav not any bookings'});
          } else {
            
            res.send({success: true, message:'you are right place'})
            
          }
        } else {
          return res.send({success: true, message:'hav not any bookings'});
        }
      } else {
        return res
          .status(403)
          .send({ message: "Forbidden access", success: false, code: 403 });
      }
    });

    //insert a bookings
    app.post("/makebooking", verifyToken, async (req, res) => {
      const doc = req.body;
      const filter = { email: req.decoded.email };
      const user = await users.findOne(filter);
      if (user.bookings) {
        user.bookings.push(doc);
      } else {
        user["bookings"] = [doc];
      }
      const update = { $set: { bookings: user.bookings } };
      const options = { upsert: true };
      const result = await users.updateOne(filter, update, options);
      res.send({ result });
    });

    //get users booking
    app.get("/userbookings", verifyToken, async (req, res) => {
      const filter = { email: req.decoded.email };
      const result = await users.findOne(filter);
      res.send(result.bookings || false);
    });
  } finally {
    //client.close();
  }
}
run().catch(console.dir);

app.get("", (req, res) => {
  res.send("travel guru running");
});

app.listen(port, () => console.log("travel run on", port));
