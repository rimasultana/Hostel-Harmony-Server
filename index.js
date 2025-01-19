const express = require("express");
const app = express();
const cors = require("cors");
const morgan = require("morgan");
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

// middleware
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.4hbah.mongodb.net/Hostel-Harmony`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
    //todo Database Collection
    const database = client.db("Hostel-Harmony");
    const userCollection = database.collection("users");
    const mealCollection = database.collection("meals");
    const reviewCollection = database.collection("reviews");
    const likeCollection = database.collection("likes");
    const requestCollection = database.collection("requests");
    //!working
    //jwt api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    const verifyToken = (req, res, next) => {
      // console.log('inside verify token', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };
    app.get("/", (req, res) => {
      res.send("Hostel Harmony Server is running");
    });
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    //* Users
    app.get("/users", async (req, res) => {
      const { page = 1, limit = 10 } = req.query;
      const skip = (page - 1) * parseInt(limit);
      const totalUsers = await userCollection.countDocuments();
      const totalPages = Math.ceil(totalUsers / parseInt(limit));
      const users = await userCollection
        .find()
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      res.send({
        users,
        totalPages,
        currentPage: parseInt(page),
      });
    });
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists" });
      }
      user.createdAt = new Date();
      const result = await userCollection.insertOne(user);
      res.send(result);
    });
    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        console.log(id, "admin");
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );

    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      res.send(user);
    });
    // Create text index for search
    // const createIndexes = async () => {
    //   try {
    //     await mealCollection.createIndex({
    //       title: "text",
    //       description: "text",
    //       category: "text",
    //       ingredients: "text",
    //       distributor_name: "text",
    //     });
    //     console.log("Text index created successfully");
    //   } catch (error) {
    //     console.error("Error creating index:", error);
    //   }
    // };
    // createIndexes();

    // User profile endpoints
    app.get("/users/profile/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
        // Check authorization
        if (email !== req.decoded.email) {
          return res.status(403).send({ message: "Unauthorized access" });
        }

        const user = await userCollection.findOne({ email });
        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        // Get recent activity
        const recentActivity = [];

        // Get recent meals
        const recentMeals = await mealCollection
          .find({ distributor_email: email })
          .sort({ createdAt: -1 })
          .limit(3)
          .toArray();
        recentMeals.forEach((meal) => {
          recentActivity.push({
            type: "meal",
            description: `Added meal: ${meal.title}`,
            timestamp: meal.createdAt,
          });
        });

        const recentReviews = await reviewCollection
          .find({ user_email: email })
          .sort({ createdAt: -1 })
          .limit(3)
          .toArray();
        recentReviews.forEach((review) => {
          recentActivity.push({
            type: "review",
            description: `Reviewed meal: ${review.text}`,
            timestamp: review.createdAt,
          });
        });

        // Sort activity by timestamp
        recentActivity.sort(
          (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
        );

        const profile = {
          ...user,
          recentActivity,
        };

        res.send(profile);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // Get user's meals
    app.get("/meals/user/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;

        // Check authorization
        if (email !== req.decoded.email) {
          return res.status(403).send({ message: "Unauthorized access" });
        }

        const meals = await mealCollection
          .find({ distributor_email: email })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(meals);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // Get user's reviews
    app.get("/reviews/user/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;

        // Check authorization
        if (email !== req.decoded.email) {
          return res.status(403).send({ message: "Unauthorized access" });
        }

        const reviews = await reviewCollection
          .find({ user_email: email })
          .sort({ createdAt: -1 })
          .toArray();
        console.log(reviews, "hika");
        res.send(reviews);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // meal
    app.get("/meals", async (req, res) => {
      const {
        search = "",
        category = "",
        minPrice = 0,
        maxPrice = Number.MAX_SAFE_INTEGER,
        page = 1,
        limit = 10,
      } = req.query;

      const skip = (page - 1) * parseInt(limit);

      // Build query based on filters
      let query = {};

      // Search filter
      if (search) {
        const searchRegex = new RegExp(search, "i");
        query.$or = [{ title: searchRegex }, { category: searchRegex }];
      }

      // Category filter
      if (category) {
        query.category = new RegExp(category, "i");
      }

      // Price range filter
      query.price = {
        $gte: parseFloat(minPrice),
        $lte: parseFloat(maxPrice) || Number.MAX_SAFE_INTEGER,
      };

      try {
        const totalMeals = await mealCollection.countDocuments(query);
        const totalPages = Math.ceil(totalMeals / parseInt(limit));
        const categories = await mealCollection.distinct("category");
        const priceRange = await mealCollection
          .aggregate([
            {
              $group: {
                _id: null,
                minPrice: { $min: "$price" },
                maxPrice: { $max: "$price" },
              },
            },
          ])
          .toArray();

        const meals = await mealCollection
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .toArray();

        res.send({
          meals,
          totalPages,
          currentPage: parseInt(page),
          totalMeals,
          categories,
          priceRange: priceRange[0] || { minPrice: 0, maxPrice: 1000 },
        });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });
    app.get("/meals/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const meal = await mealCollection.findOne({ _id: new ObjectId(id) });

        if (!meal) {
          return res.status(404).send({ message: "Meal not found" });
        }

        // Get reviews for the meal
        const reviews = await reviewCollection
          .find({ meal_id: id })
          .sort({ created_at: -1 })
          .toArray();

        // Check if user has liked the meal
        let liked = false;
        if (req.user) {
          const like = await likeCollection.findOne({
            meal_id: id,
            user_id: req.user.id,
          });
          liked = !!like;
        }

        res.send({
          ...meal,
          reviews,
          liked,
        });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    app.post("/meals/like/:id", verifyToken, async (req, res) => {
      try {
        const meal_id = req?.params?.id;
        const user = await userCollection.findOne({
          email: req?.decoded?.email,
        });
        const user_id = user?._id;
        const existingLike = await likeCollection.findOne({
          meal_id,
          user_id,
        });

        if (existingLike) {
          return res.status(400).send({ message: "Meal already liked" });
        }
        // Add like
        await likeCollection.insertOne({
          meal_id,
          user_id,
          user_name: user.name,
          user_email: user.email,
          createdAt: new Date(),
        });

        // Update meal likes count
        await mealCollection.updateOne(
          { _id: new ObjectId(meal_id) },
          { $inc: { likes: 1 } }
        );
        res.send({ message: "Meal liked successfully" });
      } catch (error) {
        console.log(error);
      }
    });
    app.post("/meals/reviews/:id", verifyToken, async (req, res) => {
      try {
        const meal_id = req.params.id;
        const user = await userCollection.findOne({
          email: req?.decoded?.email,
        });
        const user_id = user?._id;
        const { text, rating } = req.body;

        if (!text || !rating) {
          return res
            .status(400)
            .send({ message: "Text and rating are required" });
        }

        const review = {
          meal_id,
          user_id,
          user_name: user.name,
          user_email: user.email,
          text,
          rating: Number(rating),
          createdAt: new Date(),
        };

        await reviewCollection.insertOne(review);

        // Update meal rating
        const reviews = await reviewCollection.find({ meal_id }).toArray();

        const avgRating =
          reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

        await mealCollection.updateOne(
          { _id: new ObjectId(meal_id) },
          {
            $set: { rating: avgRating },
            $inc: { reviews_count: 1 },
          }
        );

        res.send(review);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    app.post("/meal-requests", verifyToken, async (req, res) => {
      try {
        const { meal_id } = req.body;
        const user = await userCollection.findOne({
          email: req?.decoded?.email,
        });
        const user_id = user?._id;
        console.log(user, "hil");
        // Check if user has an active subscription
        if (!user?.subscription?.active) {
          return res
            .status(400)
            .send({ message: "Active subscription required" });
        }

        // Check if user already requested this meal
        const existingRequest = await requestCollection.findOne({
          meal_id,
          user_id,
          user_email: user.email,
          user_name: user.name,
        });

        if (existingRequest) {
          return res.status(400).send({ message: "Meal already requested" });
        }

        const request = {
          meal_id,
          user_id,
          user_name: user.name,
          user_email: user.email,
          status: "pending",
          createdAt: new Date(),
        };

        await requestCollection.insertOne(request);
        res.send(request);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    app.get("/meals/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await mealCollection.findOne(query);
      res.send(result);
    });
    app.post("/meals", async (req, res) => {
      const meal = req.body;
      const result = await mealCollection.insertOne(meal);
      res.send(result);
    });
    app.delete("/meals/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await mealCollection.deleteOne(query);
      res.send(result);
    });
    app.patch("/meals/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const meal = await mealCollection.findOne({ _id: new ObjectId(id) });

        if (!meal) {
          return res.status(404).send({ message: "Meal not found" });
        }
        // Check if user is the distributor
        if (meal.distributor_email !== req.decoded.email) {
          return res
            .status(403)
            .send({ message: "Unauthorized to update this meal" });
        }
        const updatedMeal = {
          ...req.body,
          _id: meal._id,
          likes: meal.likes,
          rating: meal.rating,
          reviews_count: meal.reviews_count,
          createdAt: meal.createdAt,
        };
        const result = await mealCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedMeal }
        );

        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });
    app.patch("/meals-status/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: "approved",
        },
      };
      const result = await mealCollection.updateOne(query, updatedDoc);
      res.send(result);
    });
    app.get("/meals/pending", async (req, res) => {
      const result = await mealCollection.find({ status: "pending" }).toArray();
      res.send(result);
    });
    app.get("/meals/approved", async (req, res) => {
      const result = await mealCollection
        .find({ status: "approved" })
        .toArray();
      res.send(result);
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
