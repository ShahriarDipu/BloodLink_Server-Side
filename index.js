const express = require('express')
const cors = require('cors')
const app = express()

require("dotenv").config();


const port = process.env.PORT || 3000

//middle ware
app.use(express.json())
app.use(cors())


const admin = require("firebase-admin");

const  serviceAccount = require("./bloodlink-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


const verifyFBToken= async(req,res,next)=>{

  const token =req.headers.authorization;
  if(!token){
    return res.status(401).send({message:'Unauthorized access'})
  }
  try{
   const idToken= token.split(' ')[1];
   const decoded =await admin.auth().verifyIdToken(idToken)
   console.log(decoded)
   req.decoded_email = decoded.email;
    next();
  }
  catch(err){
 return res.status(401).send({ message:"Unthorized token access"})
  }
 
}




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
     const fundingsCollection = db.collection("fundings");



//stripe intrigation


const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);



////create stripe
app.post("/create-checkout-session", async (req, res) => {
  const { amount, email } = req.body;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "bdt",
          product_data: {
            name: "Donation Fund",
          },
          unit_amount: amount * 100,
        },
        quantity: 1,
      },
    ],
    customer_email: email,

    success_url: `${process.env.CLIENT_URL}/donorDashboard/donorFunding?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.CLIENT_URL}/funding-cancel`,
  });

  res.send({ url: session.url });
});

//post funding to database
app.post("/fundings", async (req, res) => {
  const { stripeSessionId } = req.body;

  const existing = await fundingsCollection.findOne({ stripeSessionId });

  if (existing) {
    return res.status(409).send({ message: "Payment already recorded" });
  }

  const fund = {
    ...req.body,
    createdAt: new Date(),
  };

  const result = await fundingsCollection.insertOne(fund);
  res.send(result);
});


//get funding from database

// app.get("/fundings", async (req, res) => {
//   const result = await fundingsCollection
//     .find()
//     .sort({ createdAt: -1 })
//     .toArray();

//   res.send(result);
// });

app.get("/fundings", verifyFBToken, async (req, res) => {
  const email = req.query.email;

  if (!email) {
    return res.status(400).send({ message: "Email is required" });
  }
   if(email !== req.decoded_email){
    return res.status(403).send({message:"access forbiden"})
   }
  const result = await fundingsCollection
    .find({ user_email: email })
    .sort({ createdAt: -1 })
    .toArray();

  res.send(result);
});






//get total fundings
app.get("/fundings/total", async (req, res) => {
  const result = await fundingsCollection.aggregate([
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]).toArray();

  res.send({ total: result[0]?.total || 0 });
});

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



app.get("/donors/role",verifyFBToken, async (req, res) => {
  const email = req.query.email?.toLowerCase().trim();
  const decodedEmail = req.decoded_email;
  if (!email) {
    return res.status(400).send({ message: "Email is required" });
  }

  if (email !== decodedEmail) {
    return res.status(403).send({ message: "Forbidden access" });
  }

  const donor = await donorsCollection.findOne({
    email: { $regex: `^${email}$`, $options: "i" }
  });
  // console.log("headers", req.headers)
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


//all donation request
app.get("/donors",  async (req, res) => {
  const { status = "all", page = 1, limit = 5 } = req.query;

  const query = {};
  if (status !== "all") {
    query.status = status;
  }

  const pageNumber = Number(page);
  const pageSize = Number(limit);
  const skip = (pageNumber - 1) * pageSize;

  const total = await donorsCollection.countDocuments(query);

  const users = await donorsCollection
    .find(query)
    .skip(skip)
    .limit(pageSize)
    .toArray();

  res.send({ total, users });
});


// update donor status
app.patch("/donors/status/:id", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const result = await donorsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status } }
  );

  res.send(result);
});
//update donor role from admin
app.patch("/donors/role/:id", async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  const result = await donorsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { role } }
  );

  res.send(result);
});



/// get donation request based on users
// app.get("/donationRequests", async (req, res) => {
//   const { email, status = "all", page = 1, limit = 5 } = req.query;

//   if (!email) {
//     return res.send({ total: 0, requests: [] });
//   }

//   const query = { requesterEmail: email };

//   if (status !== "all") {
//     query.status = status;
//   }

//   const skip = (page - 1) * limit;

//   const total = await donationRequestsCollection.countDocuments(query);

//   const requests = await donationRequestsCollection
//     .find(query)
//     .sort({ createdAt: -1 })
//     .skip(skip)
//     .limit(Number(limit))
//     .toArray();

//   res.send({ total, requests });
// });
// GET donation requests for donor dashboard
app.get("/donationrequests", async (req, res) => {
  const { email, status = "all", page = 1, limit = 5 } = req.query;

  if (!email) {
    return res.send({ total: 0, requests: [] });
  }

  // 🔥 IMPORTANT: requester OR donor
  const query = {
    $or: [
      { requesterEmail: email },
      { donorEmail: email },
    ],
  };



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



// GET pending donation requests with pagination
app.get("/donationrequests/pending", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const skip = (page - 1) * limit;

    const query = { status: "pending" };

    const total = await donationRequestsCollection.countDocuments(query);

    const requests = await donationRequestsCollection
      .find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }) // optional: newest first
      .toArray();

    res.send({
      total,
      page,
      totalPages: Math.ceil(total / limit),
      requests,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to fetch pending donation requests" });
  }
});

// GET ALL donation requests (admin)
app.get("/donationrequests/admin", async (req, res) => {
  const { status = "all", page = 1, limit = 5 } = req.query;

  const query = {};
  if (status !== "all") {
    query.status = status;
  }

  const skip = (Number(page) - 1) * Number(limit);

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
app.get("/donationRequests/:id",verifyFBToken, async (req, res) => {
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






app.get("/donationRequests/all", async(req,res)=>{

})

// UPDATE donation request by ID
app.put("/donationRequests/:id",async (req, res) => {
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


// app.delete("/donationrequests/:id", async (req, res) => {
//   const { id } = req.params;
//   const { email } = req.query; // logged-in user email

//   if (!email) {
//     return res.status(401).send({ message: "Unauthorized" });
//   }

//   const request = await donationRequestsCollection.findOne({
//     _id: new ObjectId(id),
//   });

//   if (!request) {
//     return res.status(404).send({ message: "Request not found" });
//   }

//   // 🔥 Ownership check
//   if (request.requesterEmail !== email) {
//     return res.status(403).send({
//       message: "You are not allowed to delete this request",
//     });
//   }

//   await donationRequestsCollection.deleteOne({
//     _id: new ObjectId(id),
//   });

//   res.send({ success: true });
// });

app.delete("/donationrequests/:id", async (req, res) => {
  const { id } = req.params;
  const { email } = req.query;

  if (!email) {
    return res.status(401).send({ message: "Unauthorized" });
  }

  const user = await donorsCollection.findOne({ email });

  if (!user) {
    return res.status(401).send({ message: "User not found" });
  }

  const request = await donationRequestsCollection.findOne({
    _id: new ObjectId(id),
  });

  if (!request) {
    return res.status(404).send({ message: "Request not found" });
  }

  // ✅ ALLOW: admin OR creator
  if (user.role !== "admin" && request.requesterEmail !== email) {
    return res.status(403).send({
      message: "Not allowed to delete this request",
    });
  }

  await donationRequestsCollection.deleteOne({
    _id: new ObjectId(id),
  });

  res.send({ success: true });
});







app.post("/donationrequests", async (req, res) => {
  const { requesterEmail } = req.body;

  const user = await donorsCollection.findOne({ email: requesterEmail });

  if (user?.status === "blocked") {
    return res.status(403).send({
      message: "Account is blocked",
    });
  }

  const result = await donationRequestsCollection.insertOne(req.body);
  res.send(result);
});




app.patch("/donationrequests/status/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, email } = req.body;

    if (!status || !email) {
      return res.status(400).send({ message: "Missing data" });
    }

    const query = { _id: new ObjectId(id) };
    const request = await donationRequestsCollection.findOne(query);

    if (!request) {
      return res.status(404).send({ message: "Request not found" });
    }

    //  Only donor can change inprogress → done/pending
    if (request.donorEmail !== email) {
      return res.status(403).send({ message: "Unauthorized" });
    }

    // Cancel = back to pending (not canceled)
    if (status === "pending") {
      await donationRequestsCollection.updateOne(query, {
        $set: { status: "pending" },
        $unset: { donorEmail: "", donorName: "" },
      });
    } else {
      await donationRequestsCollection.updateOne(query, {
        $set: { status },
      });
    }

    res.send({ message: "Status updated" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Status update failed" });
  }
});

////change status from admin
// ✅ ADMIN can change any donation status
app.patch("/donationrequests/admin/status/:id", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid ID format" });
  }

  if (!status) {
    return res.status(400).send({ message: "Status required" });
  }

  const result = await donationRequestsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status } }
  );

  if (result.matchedCount === 0) {
    return res.status(404).send({ message: "Request not found" });
  }

  res.send({ success: true, message: "Status updated by admin" });
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