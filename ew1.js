const express = require(""express"");
const app = express();
const { Post, User, Comment } = require(""./models"");

app.get(""/feed"", async (req, res) => {
  const posts = await Post.find().limit(20);

  const out = [];
  for (const post of posts) {
    const author   = await User.findById(post.authorId);
    const comments = await Comment.find({ postId: post._id });
    out.push({
      id: post._id,
      title: post.title,
      author: author.name,
      commentCount: comments.length,
    });
  }

  res.json(out);
});

app.listen(3000);

create to-do -post
user profile -get 
render to-dos -get
date-wise rendering-get
upd