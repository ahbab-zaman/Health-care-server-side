const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const port = process.env.PORT || 4000;
const app = express();
app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173"],
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
    const medicineCollection = client.db("medicineDB").collection("medicine");
    const discountCollection = client.db("medicineDB").collection("discount");
    const cartCollection = client.db("medicineDB").collection("carts");

    app.get("/allMedicine", async (req, res) => {
      const result = await medicineCollection.find().toArray();
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

    // Cart

    app.post("/addCart", async (req, res) => {
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

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
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
