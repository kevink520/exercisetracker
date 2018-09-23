require('dotenv').config();
const express = require('express')
const app = express()
const bodyParser = require('body-parser')

const cors = require('cors')

const mongoose = require('mongoose')
//mongoose.connect(process.env.MLAB_URI || 'mongodb://localhost/exercise-track' )
mongoose.connect(process.env.MLAB_URI, {
  user: process.env.DB_USER,
  pass: process.env.DB_PASSWORD,
  useNewUrlParser: true,
});

const Schema = mongoose.Schema;
const exerciseSchema = new Schema({
  description: String,
  duration: Number,
  date: Date,
}, { _id: false });

const userSchema = new Schema({
  username: String,
  count: Number,
  log: [exerciseSchema],
});

const User = mongoose.model('User', userSchema);

app.use(cors())

app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())

app.post('/api/exercise/new-user', (req, res) => {
  const { username } = req.body;
  const trimmedUsername = username.trim();
  if (!trimmedUsername) {
    return res.json({ error: 'Username is missing.' });
  }

  User.findOne({
    username: trimmedUsername,
  }, 'username', (err, data) => {
    if (err) {
      return res.json({ error: 'Error querying the database.' });
    }

    if (data) {
      return res.json({ error: 'Username already taken' });
    }

    const user = new User({
      username: trimmedUsername,
      count: 0,
      log: [],
    });

    user.save((err, data) => {
      if (err) {
        return res.json({"error": "Error saving the user to the database."});
      }

      res.json({
        username: data.username,
        _id: data.id,
      });
    });
  });
});

const pad = n => n < 10 ? `0${n}` : n;
const getUTCDateString = date => {
  const utcString = date.toUTCString();
  const utcStringArr = utcString.split(/,?\s/);
  return utcStringArr.slice(0, 4).join(' ');
}

app.post('/api/exercise/add', (req, res) => {
  const { userId, description, duration, date } = req.body;
  const trimmedUserId = userId.trim();
  const trimmedDescription = description.trim();
  const trimmedDuration = duration.trim();
  if (trimmedUserId  === '' || trimmedDescription === '' || trimmedDuration === '') {
    return res.json({ error: 'One or more of the required fields are empty.' });
  } 

  if (date && !date.match(/\d{4}-\d{2}-\d{2}/)) {
    return res.json({ error: 'The date should be in the format \'yyyy-mm-dd\'' });
  }
  
  const now = new Date();
  const isoToday = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const dateObj = date ? new Date(date) : new Date(isoToday);
  const exercise = {
    description: trimmedDescription,
    duration: +trimmedDuration,
    date: dateObj,
  };

  User.findByIdAndUpdate(trimmedUserId, {
    $inc: { count: 1 },
    $push: { log: exercise },
  }, (err, data) => {
    if (err) {
      return res.json({ error: 'Error querying the database.' });
    }

    if (!data) {
      return res.json({ error: 'Unknown _id' });
    }

    exercise.date = getUTCDateString(exercise.date);
    const result = {
      _id: data._id,
      username: data.username,

      ...exercise,
    };
      
    res.json(result);
  });
});

app.use(express.static('public'))
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});

app.get('/api/exercise/log', (req, res) => {
  const { userId, from, to, limit } = req.query;
  if (!userId) {
    return res.json({ error: 'Missing userId' });
  }

  if (from) {
    if (!from.match(/\d{4}-\d{2}-\d{2}/)) {
      return res.json({ error: 'The \'from\' needs to be in the format yyyy-mm-dd' });
    }
  }

  if (to) {
    if (!to.match(/\d{4}-\d{2}-\d{2}/)) {
      return res.json({ error: 'The \'to\' needs to be in the format yyyy-mm-dd' }); 
    }
  }

  if (limit) {
    if (!(typeof +limit === 'number' && +limit % 1 === 0)) {
      return res.json({ error: 'The \'limit\' needs to be an integer' });
    }
  }

  User.findById(userId, /*{
    date: {
      $gte: from ? new Date(from) : new Date('1970-01-01'),
      $lte:  to ? new Date(to) : new Date('2200-01-01'),        
    },

    limit: limit || Number.MAX_SAFE_INTEGER,
  },*/ (err, data) => {
    if (err) {
      return res.json({ error: 'Error retrieving records' });
    }

    const { _id, username, count, log } = data;
    const logResponse = log.map(exercise => {
      const exerciseRes = {
        description: exercise.description,
        duration: exercise.duration,
        date: getUTCDateString(exercise.date),
      };

      return exerciseRes;
    });

    const response = {
      _id,
      username,
      count,
      log: logResponse,
    };

    if (from) {
      response.from = getUTCDateString(from);
    }

    if (to) {
      response.to = getUTCDateString(to);
    }

    if (limit) {
      response.limit = +limit;
    }

    res.json(response);
  });
});

/*app.get('/api/exercise/delete_all', (req, res) => {
  User.remove({}, (err, data) => {
    if (err) {
      return res.json({ error: 'Error removing all users' });
    }

    res.json({ success: 'Removed all users' });
  });
});*/

// Not found middleware
app.use((req, res, next) => {
  return next({status: 404, message: 'not found'})
})

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage

  if (err.errors) {
    // mongoose validation error
    errCode = 400 // bad request
    const keys = Object.keys(err.errors)
    // report the first validation error
    errMessage = err.errors[keys[0]].message
  } else {
    // generic or custom error
    errCode = err.status || 500
    errMessage = err.message || 'Internal Server Error'
  }
  res.status(errCode).type('txt')
    .send(errMessage)
})

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})
