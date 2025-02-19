require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 4000;
const app = express();
app.use(express.json());
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://health-care-f14b8.web.app",
      "health-care-f14b8.firebaseapp.com",
    ],
    credentials: true,
  })
);

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.73pqt.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const medicineCollection = client
      .db("medicineDB")
      .collection("newMedicine");
    const discountCollection = client.db("medicineDB").collection("discount");
    const cartCollection = client.db("medicineDB").collection("carts");
    const paymentCollection = client.db("medicineDB").collection("payments");
    const userCollection = client.db("medicineDB").collection("users");
    const categoryCollection = client.db("medicineDB").collection("category");
    const advertiseCollection = client.db("medicineDB").collection("advertise");
    const subscriberCollection = client
      .db("medicineDB")
      .collection("subscribers");

    // JWT API
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "365d",
      });
      res.send({ token });
    });

    // Middleware
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Unauthorized Access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN, (error, decoded) => {
        if (error) {
          return res.status(401).send({ message: "Unauthorized Access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    const verifySeller = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isSeller = user?.role === "seller";
      if (!isSeller) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      next();
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      next();
    };

    app.get("/allMedicine", async (req, res) => {
      const result = await medicineCollection.find().toArray();
      res.send(result);
    });

    app.get("/medicine", async (req, res) => {
      const query = req.query;
      const page = parseInt(req.query.page);
      const size = parseInt(req.query.size);
      const search = req.query?.search;
      const sortAsc = req?.query?.sortAsc;
      const sortDsc = req?.query?.sortDsc;
      let setQuery = {};
      if (sortAsc == "true") {
        setQuery = { price: 1 };
      }
      if (sortDsc == "true") {
        setQuery = { price: -1 };
      }
      let searchQuery = {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { category_name: { $regex: search, $options: "i" } },
        ],
      };
      const result = await medicineCollection
        .find(searchQuery)
        .sort(setQuery)
        .skip(page * size)
        .limit(size)
        .toArray();
      res.send(result);
    });

    app.get("/medicineCount", async (req, res) => {
      const count = await medicineCollection.estimatedDocumentCount();
      res.send({ count });
    });

    app.post("/addMedicine", verifyToken, verifySeller, async (req, res) => {
      const query = req.body;
      const result = await medicineCollection.insertOne(query);
      res.send(result);
    });

    app.get("/medicine/:category", async (req, res) => {
      const category = req.params.category;
      const query = { category_name: category };
      const result = await medicineCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/discountMedicine", async (req, res) => {
      const result = await discountCollection.find().toArray();
      res.send(result);
    });

    // Add Category

    app.post("/addCategory", verifyToken, verifyAdmin, async (req, res) => {
      const query = req.body;
      const result = await categoryCollection.insertOne(query);
      res.send(result);
    });

    app.get("/allCategory", verifyToken, verifyAdmin, async (req, res) => {
      const result = await categoryCollection.find().toArray();
      res.send(result);
    });

    app.delete("/category/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await categoryCollection.deleteOne(query);
      res.send(result);
    });

    app.get("/singleCategory/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await categoryCollection.findOne(query);
      res.send(result);
    });

    app.put("/category/:id", async (req, res) => {
      const id = req.params.id;
      const cursor = { _id: new ObjectId(id) };
      const updatedCategory = req.body;
      const newCategory = {
        $set: {
          name: updatedCategory.name,
          image: updatedCategory.image,
          quantity: updatedCategory.quantity,
        },
      };
      const result = await categoryCollection.updateOne(cursor, newCategory);
      res.send(result);
    });

    // Cart

    app.post("/addCart", verifyToken, async (req, res) => {
      const query = req.body;
      const result = await cartCollection.insertOne(query);
      res.send(result);
    });

    app.get("/allCart/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    app.delete("/cart/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    // Payment functions

    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);

      const query = {
        _id: {
          $in: payment.ids.map((id) => new ObjectId(id)),
        },
      };
      const deletedCarts = await cartCollection.deleteMany(query);
      res.send({ paymentResult, deletedCarts });
    });

    app.get("/payment-invoice/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/paymentInfo", verifyToken, verifyAdmin, async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result);
    });

    app.get("/sellerPayment", verifyToken, verifySeller, async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result);
    });

    app.patch("/status/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: { status },
      };
      const result = await paymentCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // User Payment History

    app.get("/userPayment/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    app.get(
      "/sales/:pendingSales",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const status = req.params.pendingSales;
        const pendingQuery = { status: status };
        const allPending = await paymentCollection.find(pendingQuery).toArray();
        const totalPendingPrice = allPending.reduce(
          (prev, curr) => prev + curr.price,
          0
        );
        res.send({ totalPendingPrice });
      }
    );

    // Seller Payment History

    app.get(
      "/salePaid/:paidSale",
      verifyToken,
      verifySeller,
      async (req, res) => {
        const status = req.params.paidSale;
        const paidQuery = { status: status };
        const totalSeller = await userCollection.countDocuments({
          role: "seller",
        });
        const totalUser = await userCollection.countDocuments({
          role: "user",
        });
        const allPaid = await paymentCollection.find(paidQuery).toArray();
        const totalPaidPrice = allPaid.reduce(
          (prev, curr) => prev + curr.price,
          0
        );
        res.send({ totalPaidPrice, totalSeller, totalUser });
      }
    );

    app.get(
      "/sale/:pendingSale",
      verifyToken,
      verifySeller,
      async (req, res) => {
        const status = req.params.pendingSale;
        const pendingQuery = { status: status };
        const allPending = await paymentCollection.find(pendingQuery).toArray();
        const totalPendingPrice = allPending.reduce(
          (prev, curr) => prev + curr.price,
          0
        );
        res.send({ totalPendingPrice });
      }
    );

    // Total Paid Sales
    app.get(
      "/salesPaid/:paidSales",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const status = req.params.paidSales;
        const paidQuery = { status: status };
        const totalSeller = await userCollection.countDocuments({
          role: "seller",
        });
        const totalUser = await userCollection.countDocuments({
          role: "user",
        });
        const allPaid = await paymentCollection.find(paidQuery).toArray();
        const totalPaidPrice = allPaid.reduce(
          (prev, curr) => prev + curr.price,
          0
        );
        res.send({ totalPaidPrice, totalSeller, totalUser });
      }
    );
    // Users API

    app.post("/addUser", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already Existed", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get("/allUsers/:email", verifyToken, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const query = { email: { $ne: email } };
      const result = await userCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/user/role/:email", async (req, res) => {
      const email = req.params.email;
      const result = await userCollection.findOne({ email });
      res.send({ role: result?.role });
    });

    app.patch("/role/:email", verifyToken, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const { role } = req.body;
      const filter = { email: email };
      const updatedDoc = {
        $set: { role },
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.patch(
      "/updateStatus/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const { status } = req.body;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: { status: status },
        };
        const result = await advertiseCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );

    // Add Advertise by user

    app.post("/addBanner", verifyToken, verifySeller, async (req, res) => {
      const query = req.body;
      const result = await advertiseCollection.insertOne(query);
      res.send(result);
    });

    app.get("/allBanner", async (req, res) => {
      const result = await advertiseCollection.find().toArray();
      res.send(result);
    });

    app.get("/slider/:status", async (req, res) => {
      const status = req.params.status;
      const query = { status: status };
      const result = await advertiseCollection.find(query).toArray();
      res.send(result);
    });

    // Transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
    });

    // Subscriber API
    app.post("/subscribe", async (req, res) => {
      const { email: email } = req.body;
      await subscriberCollection.insertOne({ email });
      const mailOptions = {
        from: process.env.GMAIL_USER,
        to: process.env.GMAIL_USER,
        subject: "New Subscription",
        text: `A new user subscribe on your newsletter. Email: ${email}. Your get 20% of discount on each products.`,
      };
      await transporter.sendMail(mailOptions);
      res.status(200).send({ message: "Subscribed successfully!" });
    });
  } finally {
  }
}
run().catch(console.dir);

app.get("/", async (req, res) => {
  res.send("Medical Health Care is Available");
});

app.listen(port, () => {
  console.log("Medical Server is running on the port", port);
});
