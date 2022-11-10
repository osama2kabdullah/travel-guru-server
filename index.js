const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_KEY);

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
  if (token?.split(" ")[1] === "null") {
    return res
      .status(401)
      .send({ message: "Unauthorize access", success: false, code: 401 });
  }
  const tokenCode = token?.split(" ")[1]?.replace('"', "")?.replace('"', "");
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

    //validate admin
    app.get("/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email === email) {
        const user = await users.findOne({ email });

        res.send(user?.roll === "admin" ? { admin: true } : { admin: false });
      }
    });

    //payment intent
    app.post("/paymentIntent", verifyToken, async (req, res) => {
      const { cost } = req.body;
      const amount = cost * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    //update users data after pay
    app.put(
      "/updateforpay/:email/:placeName",
      verifyToken,
      async (req, res) => {
        const { placename, email } = req.params;
        if (req.decoded.email === email) {
          const user = await users.findOne({ email });
          if (user.bookings) {
            const match = user.bookings.filter(
              (book) => book.toPlace === placename
            );
            if (match.length < 0) {
              res.send({ success: false, message: "hav not that booking" });
            } else {
              console.log(req.body, match);
            }
          } else {
            res.send({ success: false, message: "hav not any bookings" });
          }
        } else {
          return res
            .status(401)
            .send({ message: "Unauthorize access", success: false, code: 401 });
        }
      }
    );

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
    app.get("/getplace/:placeName", verifyToken, async (req, res) => {
      const filter = { name: req.params.placeName };
      const result = await places.findOne(filter);
      res.send(result);
    });

    //validate user
    app.get("/validuser/:email", verifyToken, (req, res) => {
      req.decoded.email == req.params.email
        ? res.send({ valid: true })
        : res.send({ valid: false });
    });

    //get single hotel details
    app.get("/hotel/:hotelName/:placeName", verifyToken, async (req, res) => {
      const { hotelName, placeName } = req.params;
      const hotel = await places.findOne({ name: placeName });
      const match = hotel.hotels.find((hotel) => hotel.name === hotelName);
      res.send({ cost: match.cost });
    });

    //get hotels
    app.get("/hotels/:placeName", verifyToken, async (req, res) => {
      const { placeName } = req.params;
      const hotels = await places
        .find({ name: placeName })
        .project({ hotels: 1, _id: 0 })
        .toArray();
      res.send({ success: true, hotels: hotels[0].hotels });
    });

    //book hotel
    app.post(
      "/bookhotel/:bookingId/:hotelName/:placeName",
      verifyToken,
      async (req, res) => {
        const email = req.headers.authorization.split(" ")[2];
        const { bookingId, hotelName, placeName } = req.params;
        if (email !== req.decoded.email) {
          return res.status(401).send({
            message: "Unauthorize access, invalid user",
            success: false,
            code: 401,
          });
        }
        const filter = { _id: ObjectId(bookingId) };
        const booking = await bookings.findOne({ ...filter, email });
        if (booking) {
          const place = await places
            .find({ name: placeName })
            .project({ hotels: 1, _id: 0 })
            .toArray();
          const hotel = place[0].hotels.find(
            (hotel) => hotel.name === hotelName
          );
          const totalCost =
            parseFloat(hotel.cost.split("$")[1]) * parseInt(req.body.days);
          const update = {
            $set: { hotel: { ...req.body, totalCost, hotelName } },
          };
          const options = { upsert: true };
          const result = await bookings.updateOne(filter, update, options);
          res.send(result);
        } else {
          return res.status(403).send({
            message: "Forbidden access, you have no bookings",
            success: false,
            code: 403,
          });
        }
      }
    );

    //validate user for hotel booking
    app.get("/usersforbookhotel/:placeName", verifyToken, async (req, res) => {
      const { placeName } = req.params;
      const email = req.headers.authorization.split(" ")[2];
      if (email !== req.decoded.email) {
        return res.status(401).send({
          message: "Unauthorize access, invalid user",
          success: false,
          code: 401,
        });
      } else {
        const booking = await bookings.find({ email }).toArray();
        const exist = booking?.find((booking) => booking.toPlace === placeName);
        if (exist) {
          return res.send({ valid: true });
        } else {
          return res.status(403).send({
            message: "Forbidden access, you have no bookings",
            success: false,
            code: 403,
          });
        }
      }
    });

    //insert a bookings
    app.post("/makebooking", verifyToken, async (req, res) => {
      const doc = { ...req.body, email: req.decoded.email };
      const result = await bookings.insertOne(doc);

      // const filter = { email: req.decoded.email };
      // const user = await users.findOne(filter);
      // if (user.bookings) {
      //   user.bookings.push(doc);
      // } else {
      //   user["bookings"] = [doc];
      // }
      // const update = { $set: { bookings: user.bookings } };
      // const options = { upsert: true };
      // const result = await users.updateOne(filter, update, options);
      res.send({ result });
    });

    //get users bookings
    app.get("/userbookings", verifyToken, async (req, res) => {
      const filter = { email: req.decoded.email };
      const booking = await bookings.find(filter).toArray();
      res.send(booking);
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
