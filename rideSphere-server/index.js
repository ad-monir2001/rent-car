require('dotenv').config();
const express = require('express');
const cors = require('cors');
const port = process.env.PORT || 5000;
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const corsOptions = {
  origin: ['http://localhost:5173', 'https://ridesphere-303e8.web.app'],
  credentials: true,
  optionalSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

app.get('/', (req, res) => {
  res.send('Simple crud is running');
});

app.listen(port, () => {
  console.log(`Simple crud is running on the port: ${port}`);
});

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.8mt9x.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// verify Token
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.send(401).send({ message: 'unauthorized access' });
  jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.send(401).send({ message: 'unauthorized access' });
    }
    req.user = decoded;
  });
  next();
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );

    // collections
    const carCollection = client.db('carRent').collection('featuredCars');
    const testimonialCollection = client
      .db('carRent')
      .collection('testimonials');
    const addCarCollection = client.db('carRent').collection('addCars');
    const bookedCarCollection = client.db('carRent').collection('bookedCars');
    const couponCollection = client.db('carRent').collection('coupons')

    // jwt functionality
    app.post('/jwt', async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.SECRET_KEY, {
        expiresIn: '300d',
      });
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true });
    });

    // logout
    app.get('/logout', async (req, res) => {
      res
        .clearCookie('token', {
          maxAge: 0,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true });
    });

    // featured car data show
    app.get('/featuredCars', async (req, res) => {
      const cursor = carCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // testimonial data show
    app.get('/testimonials', async (req, res) => {
      const cursor = testimonialCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });
    // coupons data show
    app.get('/coupons', async (req, res) => {
      const cursor = couponCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // Add car data save to the database
    app.post('/addCars', async (req, res) => {
      const newCar = req.body;
      const result = await addCarCollection.insertOne(newCar);
      res.send(result);
    });

    // Book car data save to the database
    app.post('/bookedCars',  async (req, res) => {
      const newBookCar = req.body;

      // forbid book of already booked user
      const query = {
        bookedBy: newBookCar.bookedBy,
        bookedCarId: newBookCar.bookedCarId,
      };
      const alreadyExist = await bookedCarCollection.findOne(query);

      if (alreadyExist)
        return res.status(400).send('you have already booked the car.');

      const result = await bookedCarCollection.insertOne(newBookCar);
      // increase booking count
      const filter = { _id: new ObjectId(newBookCar.bookedCarId) };
      const update = {
        $inc: { bookingCount: 1 },
      };

      const updateBookingCount = await addCarCollection.updateOne(
        filter,
        update
      );

      res.send(result);
    });

    // Book car data get
    app.get('/bookedCars/:bookedBy', verifyToken, async (req, res) => {
      const email = req.params.bookedBy;
      const decodedEmail = req.user?.email;
      if (decodedEmail !== email)
        return res.send(401).send({ message: 'unauthorized access' });
      const query = { bookedBy: email };
      const result = await bookedCarCollection.find(query).toArray();
      res.send(result);
    });

    // update data from my booked car
    app.patch('/bookedCars/:id',  async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      const query = { _id: new ObjectId(id) };
      const update = { $set: updatedData };
      const result = await bookedCarCollection.updateOne(query, update);
      res.send(result);
    });

    // update date
    app.put('/bookedCars/:id', async (req, res) => {
      const  id  = req.params.id;
      const { bookingStart, bookingEnd } = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: { bookingStart, bookingEnd },
      };
      const result = await bookedCarCollection.updateOne(query, update);
      res.send(result);
    });

    // Add car data sort by date and price
    app.get('/addCars/sort', async (req, res) => {
      const { sortBy } = req.query;
      const sortOptions =
        sortBy === 'date'
          ? { date: -1 }
          : sortBy === 'price'
          ? { price: 1 }
          : {};

      const cursor = addCarCollection.find().sort(sortOptions);
      const result = await cursor.toArray();
      res.send(result);
    });

    // Add car data sort by date and price, filtered by user email
    app.get('/addCars/email/:userEmail/sort', verifyToken, async (req, res) => {
      const { userEmail } = req.params;
      const decodedEmail = req.user?.email;
      if (decodedEmail !== userEmail)
        return res.send(401).send({ message: 'unauthorized access' });
      const { sortBy } = req.query;
      const query = { userEmail };
      const sortOptions =
        sortBy === 'date'
          ? { date: -1 }
          : sortBy === 'price'
          ? { price: 1 }
          : {};

      try {
        const cursor = addCarCollection.find(query).sort(sortOptions);

        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        console.error('Error fetching sorted car data:', error);
        res.status(500).send({ error: 'Failed to fetch sorted car data' });
      }
    });

    // delete data from my added car
    app.delete('/addCars/:id',  async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await addCarCollection.deleteOne(query);
      res.send(result);
    });

    // update data from my added car
    app.patch('/addCars/:id',  async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      const query = { _id: new ObjectId(id) };
      const update = { $set: updatedData };
      const result = await addCarCollection.updateOne(query, update);
      res.send(result);
    });

    // show added car data
    app.get('/addCars', async (req, res) => {
      const cursor = addCarCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // my added car data
    app.get('/addCars/email/:userEmail', verifyToken, async (req, res) => {
      const email = req.params.userEmail;
      const decodedEmail = req.user?.email;
      if (decodedEmail !== email)
        return res.send(401).send({ message: 'unauthorized access' });
      const query = { userEmail: email };
      const result = await addCarCollection.find(query).toArray();
      res.send(result);
    });
  } finally {
    // Ensures that the client will close when you finish/error
    //  await client.close();
  }
}
run().catch(console.dir);
