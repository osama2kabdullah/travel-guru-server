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

async function run() {
  try {
    client.connect();
    const places = client.db("travel-guru").collection("places");
    const users = client.db("travel-guru").collection("users");

    //get placces
    app.get("/palces", async (req, res) => {
      const result = await places.find().toArray();
      res.send(result);
    });

    //post a user
    app.put("/insertUser", async (req, res) => {
      const query = { email: req.body.email };
      const existUser = await users.findOne(query);
      let result = {insert:false};
      if (!existUser) {
        const update = { $set: req.body };
        const options = { upsert: true };
        result = await users.updateOne(query, update, options);
      }
      const token = jwt.sign(query, process.env.JSON_TOKEN);
      res.send({ token, result });
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
