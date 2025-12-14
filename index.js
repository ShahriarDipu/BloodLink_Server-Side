const express = require('express')
const cors = require('cors')
const app = express()

require("dotenv").config();


const port = process.env.PORT || 3000

//middle ware
app.use(express.json())
app.use(cors())






const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kt3oo09.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const db = client.db("bloodLink_db")
    const donorsCollection=db.collection('donors')
     const  donationRequestsCollection= db.collection("donationRequest")
//Donors APi


 

app.post('/donors', async(req,res)=>{
const donor = req.body;
const result =await donorsCollection.insertOne(donor)
res.send(result)
})

//Search Donors Api

app.get("/donors/search", async(req,res)=>{
    try{
        const {bloodGroup, district, upazila}=req.query;

        const query ={};

        if ( bloodGroup) query.bloodGroup =bloodGroup
        if (district) query.district = district;
        if (upazila) query.upazila = upazila;
        // Find matching donors
    const donors = await donorsCollection.find(query).toArray();
     res.send(donors);

    }
    catch (error) {
    console.error(error);
    res.status(500).send({ message: "Server Error" });
  }
})


// search donors by email for dashboard role (api)
app.get("/donors/role", async (req, res) => {
  const email = req.query.email;

  const donor = await donorsCollection.findOne({ email });

  if (!donor) {
    return res.status(404).send({ message: "Donor not found" });
  }

  res.send({ role: donor.role });
});

//search donor information based on email
app.get("/donors/by-email", async (req, res) => {
  const email = req.query.email;

  if (!email) {
    return res.status(400).send({ message: "Email is required" });
  }

  const donor = await donorsCollection.findOne({ email });

  if (!donor) {
    return res.status(404).send({ message: "Donor not found" });
  }

  res.send(donor);
});

//Implementing Edit Button here
app.patch("/donors/update/:email", async (req, res) => {
  const email = req.params.email;
  const updatedData = req.body;

  const result = await donorsCollection.updateOne(
    { email },
    { $set: updatedData }
  );

  res.send(result);
});

///post donation requests
app.post("/donationrequests", async (req, res) => {
  const donationRequest = req.body;

  const result = await donationRequestsCollection.insertOne(
    donationRequest
  );

  res.send(result);
});

/// get donation request based on users
app.get("/donationRequests", async (req, res) => {
  const { email, status = "all", page = 1, limit = 5 } = req.query;

  if (!email) {
    return res.send({ total: 0, requests: [] });
  }

  const query = { requesterEmail: email };

  if (status !== "all") {
    query.status = status;
  }

  const skip = (page - 1) * limit;

  const total = await donationRequestsCollection.countDocuments(query);

  const requests = await donationRequestsCollection
    .find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .toArray();

  res.send({ total, requests });
});

const { ObjectId } = require("mongodb");

// GET single donation request by ID
app.get("/donationRequests/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const query = { _id: new ObjectId(id) };

    const request = await donationRequestsCollection.findOne(query);

    if (!request) {
      return res.status(404).send({ message: "Donation request not found" });
    }

    res.send(request);
  } catch (error) {
    console.error(error);
    res.status(400).send({ message: "Invalid ID format" });
  }
});


// UPDATE donation request by ID
app.put("/donationRequests/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    const result = await donationRequestsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Donation request not found" });
    }

    res.send({
      success: true,
      message: "Donation request updated successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to update donation request" });
  }
});
// app.delete("/donationRequests/:id", verifyToken, async (req, res) => {

app.delete("/donationRequests/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await donationRequestsCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({ message: "Request not found" });
    }

    res.send({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).send({ message: "Failed to delete request" });
  }
});


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");







  } finally {
    // Ensures that the client will close when you finish/error

  }
}
run().catch(console.dir);








app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})