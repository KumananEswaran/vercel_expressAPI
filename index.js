import express from 'express';
import cors from 'cors';
const app = express();
const PORT = process.env.PORT || 3000;

import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';
// import { HfInference } from '@huggingface/inference';

app.use(cors());
app.use(express.json());

// const SYSTEM_PROMPT = `You are an assistant that receives a list of ingredients that a user has and suggests a recipe they could make with some or all of those ingredients. You don't need to use every ingredient they mention in your recipe. The recipe can include additional ingredients they didn't mention, but try not to include too many ingredients. Format your response in markdown to make it easire to render to a web page`;

// const hf = new HfInference(process.env.HF_ACCESS_TOKEN);

const { Pool } = pg;

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
});

// For SignUp
app.post('/api/register', async (req, res) => {
	const { uid, name, email } = req.body;
	try {
		const result = await pool.query(
			'INSERT INTO users (uid, name, email) VALUES ($1, $2, $3) RETURNING *',
			[uid, name, email]
		);
		res.status(201).json(result.rows[0]);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Internal Server Error' });
	}
});

// To submit a recipe
app.post('/recipes', async (req, res) => {
	const { title, description, ingredients, directions, imageUrl, user_uid } =
		req.body;

	try {
		await pool.query(
			'INSERT INTO recipes (title, description, ingredients, directions, image_url, user_uid) VALUES ($1, $2, $3, $4, $5, $6)',
			[title, description, ingredients, directions, imageUrl, user_uid]
		);
		res.status(201).json({ message: 'Recipe added successfully' });
	} catch (error) {
		console.error('Error inserting recipe:', error);
		res.status(500).send({ error: 'Internal server error' });
	}
});

// To get the recipe from neon and render in HomePage
app.get('/recipes', async (req, res) => {
	try {
		const result = await pool.query(
			`SELECT recipes.*, users.name AS user_name FROM recipes JOIN users ON recipes.user_uid = users.uid ORDER BY recipes.id DESC`
		);
		res.json(result.rows);
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Failed to fetch recipes' });
	}
});

// To get details of the specific recipe
app.get('/recipes/:id', async (req, res) => {
	const { id } = req.params;
	try {
		const result = await pool.query('SELECT * FROM recipes WHERE id = $1', [
			id,
		]);
		if (result.rows.length === 0) {
			return res.status(404).json({ error: 'Recipe not found' });
		}
		res.json(result.rows[0]);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// To update recipe
app.put('/recipes/:id', async (req, res) => {
	const { title, description, ingredients, directions, image_url } = req.body;
	try {
		await pool.query(
			'UPDATE recipes SET title=$1, description=$2, ingredients=$3, directions=$4, image_url=$5 WHERE id=$6',
			[title, description, ingredients, directions, image_url, req.params.id]
		);
		res.sendStatus(200);
	} catch (error) {
		console.error(error);
		res.sendStatus(500);
	}
});

// To delete recipe
app.delete('/recipes/:id', async (req, res) => {
	try {
		await pool.query('DELETE FROM recipes WHERE id=$1', [req.params.id]);
		res.sendStatus(200);
	} catch (error) {
		console.error(error);
		res.sendStatus(500);
	}
});

// Hugging Face AI
// app.post('/generate-recipe', async (req, res) => {
// 	const ingredientsArr = req.body.ingredients;
// 	const ingredientsString = ingredientsArr.join(', ');

// 	try {
// 		const response = await hf.chatCompletion({
// 			model: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
// 			messages: [
// 				{ role: 'system', content: SYSTEM_PROMPT },
// 				{
// 					role: 'user',
// 					content: `I have ${ingredientsString}. Please give me a recipe you'd recommend I make!`,
// 				},
// 			],
// 			max_tokens: 1024,
// 		});
// 		res.status(200).json({ recipe: response.choices[0].message.content });
// 	} catch (err) {
// 		console.error(err.message);
// 		res.status(500).json({ error: 'Failed to generate recipe' });
// 	}
// });

// toggle likes
app.post('/recipes/:id/toggle-like', async (req, res) => {
	const { id } = req.params;
	const { uid } = req.body;

	try {
		const liked = await pool.query(
			'SELECT 1 FROM recipe_likes WHERE recipe_id = $1 AND user_uid = $2',
			[id, uid]
		);

		if (liked.rowCount > 0) {
			await pool.query(
				'DELETE FROM recipe_likes WHERE recipe_id = $1 AND user_uid = $2',
				[id, uid]
			);
			await pool.query(
				'UPDATE recipes SET likes = GREATEST(likes - 1, 0) WHERE id = $1',
				[id]
			);
			return res.json({ liked: false });
		} else {
			await pool.query(
				'INSERT INTO recipe_likes (recipe_id, user_uid) VALUES ($1, $2)',
				[id, uid]
			);
			await pool.query('UPDATE recipes SET likes = likes + 1 WHERE id = $1', [
				id,
			]);
			return res.json({ likes: true });
		}
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Toggle like failed' });
	}
});

// to know whether a recipe is liked or not
app.get('/user-likes/:uid', async (req, res) => {
	const { uid } = req.params;
	try {
		const result = await pool.query(
			'SELECT recipe_id FROM recipe_likes WHERE user_uid = $1',
			[uid]
		);
		const likedRecipeIds = result.rows.map((row) => row.recipe_id);
		res.json(likedRecipeIds);
	} catch (err) {
		console.error('Error fetching likes:', err);
		res.status(500).json({ error: 'Failed to fetch likes' });
	}
});

// toggle bookmark
app.post('/bookmarks', async (req, res) => {
	const { user_uid, recipe_id } = req.body;

	try {
		const check = await pool.query(
			'SELECT * FROM bookmarked_recipe WHERE user_uid = $1 AND recipe_id = $2',
			[user_uid, recipe_id]
		);

		if (check.rows.length > 0) {
			await pool.query(
				'DELETE FROM bookmarked_recipe WHERE user_uid = $1 AND recipe_id = $2',
				[user_uid, recipe_id]
			);
			return res.json({ bookmarked: false });
		} else {
			await pool.query(
				'INSERT INTO bookmarked_recipe (user_uid, recipe_id) VALUES ($1, $2)',
				[user_uid, recipe_id]
			);
			return res.json({ bookmarked: true });
		}
	} catch (error) {
		console.error(error);
		res.status(500).send('Server error');
	}
});

// Get all bookmarks for user
app.get('/bookmarks/:user_uid', async (req, res) => {
	const { user_uid } = req.params;

	try {
		const bookmarks = await pool.query(
			'SELECT recipe_id FROM bookmarked_recipe WHERE user_uid = $1',
			[user_uid]
		);
		res.json(bookmarks.rows.map((row) => row.recipe_id));
	} catch (error) {
		console.error(error);
		res.status(500).send('Server error');
	}
});

app.get('/', (req, res) => {
	res.send('Welcome to the Express API!');
});

app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});
