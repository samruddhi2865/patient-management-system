const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- View engine + Layouts ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);                // enable layouts
app.set('layout', 'layout');            // default layout file: views/layout.ejs

// ---------- Static files ----------
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Middleware ----------
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(methodOverride('_method')); // allows ?_method=PUT

// ---------- Database Config ----------
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'mysql123',  
  database: 'patient_db1',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool;

// ---------- Initialize DB ----------
async function initDb() {
  try {
    pool = await mysql.createPool(dbConfig);
    const [rows] = await pool.query('SELECT 1+1 AS test');
    console.log('DB connected:', rows[0].test);
  } catch (err) {
    console.error('DB connection failed:', err);
    process.exit(1);
  }
}

initDb();

// ---------- Routes ----------

// Home page
app.get('/', (req, res) => {
  res.render('index');
});

// Add patient form
app.get('/add', (req, res) => {
  res.render('add', { errors: null, form: {} });
});

// Add patient (POST)
app.post('/add', async (req, res) => {
  const { name, email } = req.body;
  const errors = [];

  if (!name || name.trim().length < 2) errors.push('Name must be at least 2 characters.');
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) errors.push('Enter a valid email.');

  if (errors.length) {
    return res.status(400).render('add', { errors, form: { name, email } });
  }

  try {
    const sql = 'INSERT INTO patients (name, email) VALUES (?, ?)';
    await pool.execute(sql, [name.trim(), email.trim()]);
    res.redirect('/patients');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).render('add', {
        errors: ['Email already exists.'],
        form: { name, email }
      });
    }
    console.error(err);
    res.status(500).send('Error adding patient.');
  }
});

// Show all patients + search
app.get('/patients', async (req, res) => {
  const q = (req.query.q || '').trim();
  try {
    let rows;
    if (q) {
      const sql = 'SELECT * FROM patients WHERE name LIKE ? OR email LIKE ?';
      const like = '%' + q + '%';
      const [r] = await pool.execute(sql, [like, like]);
      rows = r;
    } else {
      const [r] = await pool.execute('SELECT * FROM patients');
      rows = r;
    }
    res.render('list', { patients: rows, q });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error while fetching patients.');
  }
});

// Edit patient form
app.get('/patients/edit/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM patients WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).send('Patient not found.');
    res.render('edit', { patient: rows[0], errors: null });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading edit form.');
  }
});

// Update patient
app.put('/patients/:id', async (req, res) => {
  const id = req.params.id;
  const { name, email } = req.body;
  const errors = [];

  if (!name || name.trim().length < 2) errors.push('Name must be at least 2 characters.');
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) errors.push('Enter a valid email.');

  if (errors.length) {
    const [rows] = await pool.execute('SELECT * FROM patients WHERE id = ?', [id]);
    return res.status(400).render('edit', { patient: rows[0], errors });
  }

  try {
    await pool.execute('UPDATE patients SET name = ?, email = ? WHERE id = ?', [
      name.trim(),
      email.trim(),
      id
    ]);
    res.redirect('/patients');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      const [rows] = await pool.execute('SELECT * FROM patients WHERE id = ?', [id]);
      return res.status(400).render('edit', {
        patient: rows[0],
        errors: ['Email already used by another patient.']
      });
    }
    console.error(err);
    res.status(500).send('Error updating patient.');
  }
});

// Delete patient
app.post('/patients/delete/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM patients WHERE id = ?', [req.params.id]);
    res.redirect('/patients');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error deleting patient.');
  }
});

// 404 fallback
app.use((req, res) => {
  res.status(404).send('Page not found.');
});

// Server start
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
