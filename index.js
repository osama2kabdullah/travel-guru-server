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

    //ADMIN
    //varify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.headers.authorization.split(" ")[2];
      const user = await users
        .find({ email })
        .project({ role: 1, _id: 0 })
        .toArray();
      if (user[0].role === "admin" && email === req.decoded.email) {
        next();
      } else {
        res
          .status(401)
          .send({ message: "Unauthorize access", success: false, code: 401 });
      }
    };

    //RUD places
    app.put(
      "/actionplace/:placename/:method",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const { method, placename } = req.params;
        let result = {};
        if(method === 'remove'){
          result = await places.deleteOne({name: placename});
        }else if(method === 'update'){
          result = await places.updateOne({name: placename}, {$set: req.body}, {upsert: true});
        }else if(method === 'add'){
          result = await places.insertOne({...req.body, hotels: []});
        }
        res.send(result)
      }
    );

    //RUD hotels
    app.put(
      "/actionhotel/:placename/:method/:hotelName",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const { method, placename, hotelName } = req.params;
        const hotelArray = await places
          .find({ name: placename })
          .project({ hotels: 1, _id: 0 })
          .toArray();
        const Allhotel = hotelArray?.[0]?.hotels;

        if (method === "Add this") {
          const query = { name: placename };
          const updateDocument = {
            $push: { hotels: req.body },
          };
          const result = await places.updateOne(query, updateDocument);
          res.send(result);
        } else if (method === "Update this") {
          const perticularHotel = Allhotel.find(
            (hotel) => hotel.name === hotelName
          );
          console.log(req.body);
          // const query = {name: placename, "hotels.name": hotelName};
          // const update = {$set: {"hotels.$[f]": req.body}};
          // const options = {arrayFilters: [{"f.name": hotelName}]};
          // const result = await places.updateOne(query, update, options);

          // console.log(result);
        } else if (method === "Remove this") {
          const query = { name: placename };
          const updateDocument = {
            $pull: { hotels: { name: hotelName } },
          };
          const result = await places.updateOne(query, updateDocument);
          res.send(result);
        }

        //To delete
        // -----------------
        // collection.update(
        //   { _id: id },
        //   { $pull: { 'contact.phone': { number: '+1786543589455' } } }
        // );
      }
    );

    //make admin
    app.patch("/makeadmin/:id", verifyToken, verifyAdmin, async (req, res) => {
      const result = await users.updateOne(
        { _id: ObjectId(req.params.id) },
        { $set: { role: "admin" } },
        { upsert: true }
      );
      res.send(result);
    });

    //get all hotels
    app.get("/allhotels", verifyToken, verifyAdmin, async (req, res) => {
      const hotels = await places
        .find()
        .project({ hotels: 1, name: 1 })
        .toArray();
      res.send(hotels);
    });

    //get all places
    app.get("/allplaces", verifyToken, verifyAdmin, async (req, res) => {
      const allPlace = await places.find().project({ name: 1 }).toArray();
      res.send(allPlace);
    });

    //block someone
    app.patch("/block/:id", verifyToken, verifyAdmin, async (req, res) => {
      const result = await users.updateOne(
        { _id: ObjectId(req.params.id) },
        { $set: { role: "block" } },
        { upsert: true }
      );
      res.send(result);
    });

    //unblock someone
    app.patch("/unblock/:id", verifyToken, verifyAdmin, async (req, res) => {
      const result = await users.updateOne(
        { _id: ObjectId(req.params.id) },
        { $set: { role: "user" } },
        { upsert: true }
      );
      res.send(result);
    });

    //user bookings count
    app.get(
      "/userbookingscount/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        // const count = await bookings.find({email: req.params.email}).count();
        const count = await bookings.count({ email: req.params.email });
        // console.log(booking);
        res.send({ count });
      }
    );

    //get all users
    app.get("/allusers", verifyToken, verifyAdmin, async (req, res) => {
      const allUser = await users.find({}).toArray();
      // const rmD = await users.updateMany({}, {$unset : {bookings: 1}});
      res.send(allUser);
    });

    //get all bookings
    app.get(
      "/allbookings/:filter",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const allbookings = await bookings.find().toArray();

        let Allbooking;
        const current = new Date();
        if ("Generel" === req.params.filter) {
          let followingDay = new Date(current.getTime() - 86400000); // + 1 day in added
          Allbooking = await bookings
            .find({ toDate: { $gt: followingDay } })
            .toArray();
        } else if ("Old" === req.params.filter) {
          let followingDay = new Date(current.getTime() - 86400000); // + 1 day in added
          Allbooking = await bookings
            .find({ toDate: { $lt: followingDay } })
            .toArray();
        }
        res.send(Allbooking);
      }
    );

    //get placces
    app.get("/palces", async (req, res) => {
      const result = await places.find().toArray();
      res.send(result);
    });

    //FOR USER
    //load all places
    app.get('/comonplaces', async (req, res)=>{
      const AllPlace = await places.find().project({name: 1, picture: 1, about: 1}).toArray();
      res.send(AllPlace)
    })
    
    //filterbooking
    app.get("/filterbooking/:filter", verifyToken, async (req, res) => {
      const { filter } = req.params;
      const { email } = req.decoded;
      let booking;
      if (filter === "previus_trips") {
        booking = await bookings
          .find({ email, toDate: { $lt: new Date() } })
          .toArray();
      } else if (filter === "future_trips") {
        booking = await bookings
          .find({ email, FromDate: { $gt: new Date() } })
          .toArray();
      } else {
        booking = await bookings
          .find({
            email,
            FromDate: { $lte: new Date() },
            toDate: { $gte: new Date() },
          })
          .toArray();
      }
      res.send(booking);
    });

    //validate admin
    app.get("/admin", verifyToken, async (req, res) => {
      const email = req.headers.authorization.split(" ")[2];
      if (req.decoded.email === email) {
        const user = await users.findOne({ email, role: "admin" });
        return res.send(user ? { admin: true } : { admin: false });
      }
      res
        .status(401)
        .send({ message: "Unauthorize access", success: false, code: 401 });
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
    app.put("/updateforpay/:bookingId", verifyToken, async (req, res) => {
      const email = req.headers.authorization.split(" ")[2];
      const { bookingId } = req.params;
      if (req.decoded.email === email) {
        const booking = await bookings.findOne({ _id: ObjectId(bookingId) });
        if (booking) {
          const newHotel = { ...booking.hotel, payDetail: req.body };
          const update = { $set: { payStatus: true, hotel: newHotel } };
          const options = { upsert: true };
          const book = await bookings.updateOne(
            { _id: ObjectId(bookingId) },
            update,
            options
          );
          res.send(book);
        } else {
          return res.send({ success: false, message: "hav not that booking" });
        }
      } else {
        return res
          .status(401)
          .send({ message: "Unauthorize access", success: false, code: 401 });
      }
    });

    //cancelTour
    app.delete("/cancelTour/:id", verifyToken, async (req, res) => {
      const email = req.headers.authorization.split(" ")[2];
      const booking = await bookings.findOne({ _id: ObjectId(req.params.id) });
      if (email !== req.decoded.email || !booking) {
        return res
          .status(401)
          .send({ message: "Unauthorize access", success: false, code: 401 });
      }
      const result = await bookings.deleteOne({
        _id: ObjectId(req.params.id),
        toDate: { $gte: new Date() },
      });
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

    //get cost
    app.get("/getcost/:bookingId", verifyToken, async (req, res) => {
      const { bookingId } = req.params;
      const booking = await bookings
        .find({ _id: ObjectId(bookingId) })
        .project({ hotel: { totalCost: 1 }, _id: 0 })
        .toArray();
      res.send(booking[0].hotel);
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
            $set: {
              hotel: { ...req.body, totalCost, hotelName },
              payStatus: false,
            },
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
      const { fromPlace, toPlace, FromDate, toDate } = req.body;
      const doc = {
        fromPlace,
        toPlace,
        FromDate: new Date(FromDate),
        toDate: new Date(toDate),
        email: req.decoded.email,
      };
      const result = await bookings.insertOne(doc);
      res.send({ result });
    });
  } finally {
    //client.close();
  }
}
run().catch(console.dir);

app.get("", async (req, res) => {
  res.send("travel guru running");
});

app.listen(port, () => console.log("travel run on", port));
