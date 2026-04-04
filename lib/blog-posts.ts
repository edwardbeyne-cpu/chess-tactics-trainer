export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  date: string;
  readTime: number;
  content: string;
}

export const blogPosts: BlogPost[] = [
  {
    slug: "spaced-repetition-chess",
    title: "Why Spaced Repetition Is the Fastest Way to Improve at Chess Tactics",
    excerpt:
      "Most chess players grind puzzles the wrong way — solving hundreds randomly without any system. Spaced repetition changes everything by making sure you review each pattern at exactly the moment you'd otherwise forget it.",
    category: "Training Science",
    date: "April 4, 2026",
    readTime: 6,
    content: `
<p>Every chess player has sat down at a tactics trainer, solved 30 puzzles, felt good about it, and then blundered the same fork two weeks later in a real game. The problem isn't effort. The problem is method.</p>

<h2>The Forgetting Curve</h2>
<p>In 1885, German psychologist Hermann Ebbinghaus discovered something uncomfortable: without reinforcement, we forget roughly 70% of new information within 24 hours. He plotted this as the "forgetting curve" — an exponential decay from the moment you first learn something.</p>
<p>The good news is that each time you successfully recall something before you forget it, the curve flattens. Your brain treats effortful retrieval as a signal that this information is worth keeping. Review at the right moment, and the next forgetting curve is much shallower. Miss the window, and you're starting from scratch.</p>
<p>This insight underpins one of the most powerful learning systems ever developed: spaced repetition.</p>

<h2>How Spaced Repetition Works</h2>
<p>Spaced repetition is simple in principle: instead of reviewing material on a fixed schedule, you review it at increasing intervals based on how well you know it. Nail a puzzle? It comes back in 3 days. Nail it again? 7 days. Then 14. Then 30. Fail? It resets to tomorrow.</p>
<p>The SM-2 algorithm — the one powering Anki, used by millions of medical students — formalizes this into a precise scheduling system. Each correct response increases the "ease factor" and extends the interval. Each failure collapses it. Over time, your review queue fills up only with the patterns that sit right at the edge of forgetting — the exact problems your brain most needs to see.</p>

<h2>Why Random Puzzles Are So Inefficient</h2>
<p>Consider the math of a typical tactics trainer. If you do 100 random puzzles, you might see the "knight fork on c7" pattern three times — maybe two days apart, maybe the same session. None of those repetitions are timed to your personal forgetting curve. You might encounter a pin pattern when you already know it cold (wasted), or not see a skewer for three weeks after you barely learned it (forgotten).</p>
<p>Random repetition creates an illusion of practice. You solve puzzles, your streak counter goes up, and you feel productive. But without a system to space your reviews intelligently, you're spending most of your training budget on patterns you already know and neglecting the patterns you're about to lose.</p>
<p>Research in cognitive psychology consistently shows that spaced practice produces 2–3x better long-term retention than massed practice for the same total study time. In chess terms: you can get more tactical improvement from 20 well-timed puzzles than from 100 random ones.</p>

<h2>Pattern Recognition Is the Real Skill</h2>
<p>Grandmasters don't calculate every position from scratch. They recognize patterns. When Magnus Carlsen "sees" a combination, he's largely pattern-matching against tens of thousands of stored positions. The calculation is short because the pattern recognition does most of the work.</p>
<p>Tactical patterns — forks, pins, skewers, back-rank mates, discovered attacks — are the vocabulary of chess calculation. Each one is a mental chunk you either recognize instantly or don't. Spaced repetition is the most efficient way to build that library, because it directly targets the forgetting curve at the pattern level.</p>

<h2>How Chess Tactics Trainer Uses It</h2>
<p>Chess Tactics Trainer implements SM-2 at the pattern level. When you solve a fork puzzle correctly, the system schedules your next fork review based on your personal history with that pattern — not a global timer, but your specific forgetting curve for forks. When you analyze your Chess.com games, we identify which patterns you miss most in real play and front-load those into your training queue.</p>
<p>The result is a personalized curriculum that does two things at once: it surfaces your weakest patterns, and it times your reviews to prevent forgetting. You're not just solving puzzles — you're systematically burning tactical vocabulary into long-term memory.</p>
<p>If you've been grinding puzzles without a system, you've already done the hard part (showing up). Switching to spaced repetition just makes sure that effort converts into permanent improvement.</p>

<p>Read more: <a href="/blog/how-many-chess-puzzles-per-day">How many puzzles you actually need per day →</a></p>
`,
  },
  {
    slug: "how-many-chess-puzzles-per-day",
    title:
      "How Many Chess Puzzles Should You Do Per Day? (The Science Says Less Than You Think)",
    excerpt:
      "The instinct is to do more puzzles. The research says that's wrong. Here's why 10 focused, mastery-based puzzles beat 100 random ones — and how a mastery system changes what 'done' means.",
    category: "Training Tips",
    date: "April 4, 2026",
    readTime: 5,
    content: `
<p>Ask a chess improvement forum how many puzzles to do per day and you'll get answers ranging from 20 to 500. The implicit assumption is that more is better. The research on deliberate practice says otherwise.</p>

<h2>The Quantity Trap</h2>
<p>Most chess players optimize for puzzle count. Lichess shows you your total puzzles solved. Chess.com celebrates streaks. The natural result is a training mindset that rewards volume over quality — grind through as many puzzles as possible, feel productive, repeat.</p>
<p>But cognitive science has a different take. Anders Ericsson, the researcher whose work on deliberate practice influenced everything from chess training to athletic coaching, found that the quality of focused practice matters far more than quantity. Elite performers typically max out at 4–5 hours of genuine deliberate practice per day — not because they lack motivation, but because effortful, focused learning depletes cognitive resources in a way that mindless repetition doesn't.</p>
<p>When you blast through 100 random puzzles in rapid succession, you're not doing deliberate practice. You're pattern-matching on autopilot. Some puzzles you nail because you saw the same pattern yesterday. Others you miss and move on without understanding why. The feedback loop is weak, and genuine learning is shallow.</p>

<h2>What Makes a Puzzle "Count"</h2>
<p>A puzzle only produces durable learning when three things happen: you engage with it effortfully, you receive feedback about whether you were right and why, and you review it at the right interval before forgetting.</p>
<p>Most puzzle tools nail the first two. Almost none do the third. That's the gap spaced repetition fills — and it's why puzzle count is the wrong metric. The right metric is mastery: have you solved this pattern correctly enough times, with enough spacing, to encode it in long-term memory?</p>

<h2>The Case for 10 Mastery-Based Puzzles</h2>
<p>Here's what 10 focused puzzles looks like with a mastery system: you work through your personal review queue — patterns timed to hit right before you'd forget them. Some are new patterns you're learning for the first time. Some are patterns you learned last week and are reinforcing. Some are patterns you almost have, requiring one more correct solve before they move to a longer interval.</p>
<p>That's 10 puzzles of high cognitive engagement, all aimed at your specific weak spots, timed to maximize retention. Compare that to 100 random puzzles where maybe 10 hit patterns you're about to forget, 40 are patterns you already know cold, and 50 are patterns you haven't seen enough to retain regardless.</p>
<p>10 beats 100 because the 10 are doing real work.</p>

<h2>How Our Mastery System Works</h2>
<p>Chess Tactics Trainer defines mastery as three correct solves of the same pattern, non-consecutive. The non-consecutive requirement matters: getting something right three times in a row on the same day doesn't prove mastery. It proves you remembered it for five minutes.</p>
<p>A pattern is only "advancing" when you solved it today, remembered it three days later, and then remembered it again a week after that. Those non-consecutive correct solves are evidence that the pattern is moving into genuine long-term storage — not just short-term working memory.</p>
<p>Once a pattern reaches mastery, its review interval extends to 14 days, then 30 days, then monthly maintenance. Your daily queue shrinks as patterns graduate, creating room to introduce harder patterns at the right time.</p>

<h2>What This Means for Your Training</h2>
<p>If you're used to doing 100 puzzles a day, this might feel too easy. Resist that feeling. The cognitive effort of 10 well-chosen puzzles — ones that are genuinely at the edge of your memory — is higher than 100 random ones. You'll notice the difference in your games within weeks.</p>
<p>If you want to do more, that's fine — but do your 10 mastery puzzles first. They're the ones that build permanent pattern recognition. Additional puzzles can supplement, but they can't replace the systematic reinforcement of a spaced repetition queue.</p>
<p>The goal isn't to solve more puzzles. The goal is to recognize more patterns in your games. Those are different objectives, and they require different training systems.</p>

<p>Read more: <a href="/blog/spaced-repetition-chess">How spaced repetition works in chess training →</a></p>
`,
  },
  {
    slug: "why-you-are-stuck-at-your-chess-rating",
    title: "Why You Are Stuck at Your Chess Rating (And What to Fix)",
    excerpt:
      "Rating plateaus feel mysterious, but they almost always have the same cause: you're failing at pattern recognition, not calculation. Here's what's actually costing you points and how targeted training breaks the plateau.",
    category: "Improvement",
    date: "April 4, 2026",
    readTime: 6,
    content: `
<p>You've been stuck at the same rating for six months. You study openings. You read endgame books. You analyze your losses. And yet the number barely moves. You're not alone — rating plateaus are one of the most common experiences in chess improvement, and they're almost always caused by the same thing.</p>

<h2>The Plateau Problem</h2>
<p>Most players diagnose their plateau wrong. They think they need to know more — more openings, more endgame theory, more strategic concepts. So they study more of the same things and stay stuck at the same rating.</p>
<p>The actual problem, for most players below 1800, is tactical pattern recognition. Not calculation depth, not strategic understanding — the ability to instantly recognize common tactical shapes when they appear on the board.</p>
<p>Here's why this matters: chess calculation is expensive. When you miss a tactic, it's rarely because you couldn't calculate the sequence if you looked for it. It's because you didn't know to look. Pattern recognition is the trigger — the visual alarm that tells you "something is here." Without that alarm, you never start the calculation, and the tactic goes unseen.</p>

<h2>What's Costing You Points by Level</h2>
<p><strong>Beginners (under 800):</strong> Hanging pieces. The overwhelming majority of games at this level are decided by one player leaving a piece undefended and the other capturing it. This isn't about missing tactics — it's about not yet having the habit of checking whether every piece is safe before moving. Simple one-move pattern recognition solves most of this.</p>
<p><strong>Intermediate players (800–1400):</strong> Forks and pins. At this level, players have stopped blundering pieces constantly, but they regularly walk into knight forks, don't see discovered attacks coming, and miss simple pins that win material. These patterns are the bread and butter of club-level chess, and missing them is what keeps players in this range for years.</p>
<p><strong>Advanced club players (1400–1800):</strong> Back-rank mates, deflections, and overloading. Players at this level often overlook combinations involving sacrifice, especially when the winning sequence requires giving up a piece before gaining more back. Back-rank weaknesses and overloaded defenders are the most common sources of missed wins in this range.</p>

<h2>Why You're Still Missing These</h2>
<p>Pattern recognition isn't knowledge — it's a trained reflex. You can understand what a fork is intellectually and still not see a fork in a real game, because recognizing it under time pressure requires the pattern to be deeply encoded, not just consciously known.</p>
<p>The reason players plateau is that they're not building that encoding systematically. They might solve fork puzzles occasionally, but if they're not drilling them with proper spacing, the pattern doesn't become automatic. It stays in conscious working memory rather than moving to the fast, automatic recognition that grandmasters use.</p>
<p>This is the core insight of deliberate practice applied to chess: you need to train the specific patterns you miss, at the right frequency, until recognition becomes instant.</p>

<h2>How Targeted Training Breaks Plateaus</h2>
<p>Generic tactics training improves your general tactical ability, but it doesn't efficiently target your specific blind spots. If you're an 1100 who never misses pins but constantly falls for forks, spending half your training time on pin puzzles is wasted effort.</p>
<p>Chess Tactics Trainer analyzes your actual games to identify which patterns you miss most in real play. That data drives your training queue, so the patterns costing you the most rating points get the most attention. Combined with spaced repetition to ensure those patterns are properly encoded — not just reviewed once and forgotten — this creates the fastest possible path from your current rating to the next level.</p>
<p>Plateaus break when you stop training chess in general and start fixing your specific weaknesses. The patterns holding you back are identifiable. The training to fix them is systematic. The only question is whether you have a system that does both.</p>

<p>Read more: <a href="/blog/chess-fork-tactics-guide">How to spot fork tactics every time →</a></p>
`,
  },
  {
    slug: "chess-fork-tactics-guide",
    title: "Chess Fork Tactics: How to Spot Them Every Time",
    excerpt:
      "A fork attacks two pieces at once and wins material almost every time — yet players at every level miss them in their games. Here's how to train your pattern recognition so you never miss a fork again.",
    category: "Tactics Guide",
    date: "April 4, 2026",
    readTime: 7,
    content: `
<p>A fork is one of the most powerful tactics in chess: one piece attacks two enemy pieces simultaneously, and since your opponent can only move one piece per turn, you win material. In theory, it's simple. In practice, forks are missed in thousands of club games every day.</p>
<p>The difference between players who spot forks reliably and players who miss them isn't intelligence — it's pattern recognition training. Here's what you need to know.</p>

<h2>What a Fork Is</h2>
<p>A fork occurs when a single piece attacks two or more enemy pieces at the same time. The attacker creates a double threat; the defender can only respond to one. The attacker captures whichever piece is left behind.</p>
<p>Forks can win material of any value — a knight forking a rook and bishop wins at least an exchange, while a queen fork on king and rook forces a decisive material gain. The principle is universal: create two threats, win one.</p>

<h2>The 4 Types of Forks</h2>
<p><strong>Knight forks</strong> are the most common and most dangerous. Knights move in an L-shape, attacking squares that no other piece covers. A knight fork on a "royal fork" square — attacking king and rook simultaneously — is a game-ending tactic at every level. Knight forks are particularly deadly because the L-shape movement is non-intuitive: the attacking square often looks safe until it's too late.</p>
<p><strong>Pawn forks</strong> happen when an advancing pawn can capture either of two adjacent enemy pieces. A pawn fork is often a consequence of poor piece coordination — two pieces on adjacent files that a pawn can attack simultaneously. Watch for pawn fork opportunities whenever your opponent's pieces cluster together.</p>
<p><strong>Bishop forks</strong> require the bishop to sit on a diagonal attacking two pieces at once. These are less common than knight forks because bishops are easier to see on open diagonals, but they appear regularly in games where one player's pieces are uncoordinated. A bishop forking two rooks, or a rook and a king, is a theme worth training.</p>
<p><strong>Queen forks</strong> are the most powerful but also the most visible. A queen fork typically wins significant material — often a piece or rook — but your opponent will usually see it coming unless it emerges from a sequence that forces their pieces onto the vulnerable squares. Queen forks are frequently the payoff of a longer tactical sequence.</p>

<h2>3 Visual Cues to Look For Before Every Move</h2>
<p><strong>1. Undefended or loose pieces.</strong> A fork only wins material if your opponent can't simply recapture on both squares. Before looking for forks, identify which enemy pieces are undefended or defended only once. These are the targets. If you see two loose pieces anywhere on the board, immediately ask whether any of your pieces can attack both simultaneously.</p>
<p><strong>2. The knight's range of squares.</strong> The knight has up to eight squares it can reach from any position. Before every move, mentally map out where your knights can jump on the next move. If any of those squares attacks two enemy pieces, you have a potential fork. This "see the knight's future" habit is what separates players who find knight forks reliably from those who miss them.</p>
<p><strong>3. Your opponent's king position relative to their pieces.</strong> King forks — attacking the king and another piece simultaneously — are often decisive because the king must move. After your opponent castles, note where their king sits relative to their rooks and heavy pieces. A knight or bishop that can threaten the king while simultaneously attacking another piece is often a winning tactic waiting to be triggered.</p>

<h2>How to Train Fork Recognition</h2>
<p>The key to spotting forks reliably is burning the visual patterns into automatic recognition, not studying them consciously. You need to see a knight fork shape and instantly recognize it, without having to deliberately search for it.</p>
<p>This requires targeted, spaced repetition training. Chess Tactics Trainer identifies whether you're missing forks in your actual games and, if you are, weights fork puzzles into your queue until recognition becomes automatic. Players whose game analysis shows they're walking into opponent forks or missing their own fork opportunities will see fork puzzles prioritized until the pattern is mastered.</p>
<p>The goal isn't to know what a fork is — you already know that. The goal is to recognize the fork shape in a fraction of a second, from any position, under any time pressure. That's a trained reflex, and it's built through targeted, repeated exposure with proper spacing.</p>

<p>Read more: <a href="/blog/why-you-are-stuck-at-your-chess-rating">Why you're stuck at your rating →</a> | <a href="/blog/chess-tactics-vs-strategy">Tactics vs strategy: what actually wins games →</a></p>
`,
  },
  {
    slug: "chess-tactics-vs-strategy",
    title:
      "Chess Tactics vs Strategy: Why Tactics Win More Games at Your Level",
    excerpt:
      "Strategy is the glamorous part of chess — long-term plans, pawn structures, piece coordination. But below 1800, tactics decide the overwhelming majority of games. Here's why studying strategy before mastering tactics is backwards.",
    category: "Chess Fundamentals",
    date: "April 4, 2026",
    readTime: 6,
    content: `
<p>Chess has two dimensions: tactics and strategy. Tactics are forcing sequences — combinations where correct play produces a concrete, calculable result (winning material, forcing checkmate, gaining positional advantage through a sequence of forcing moves). Strategy is everything else: pawn structure, piece coordination, long-term plans, prophylaxis.</p>
<p>Both matter at the highest levels. But for the vast majority of players, tactics decide the game. Understanding why — and acting on it — is one of the highest-leverage things you can do for your chess improvement.</p>

<h2>The Difference, Precisely</h2>
<p>A tactic is a concrete sequence with a definite outcome. "Knight to e5, forking the queen and rook, wins material" is a tactic. The calculation is finite. There's a right answer.</p>
<p>Strategy is about steering the game toward favorable positions when there's no immediate forcing sequence. "My bishop is better than his knight in this pawn structure, so I should trade off his remaining bishop and exploit the weak squares" is a strategic idea. It's correct, but its execution depends on a dozen future decisions.</p>
<p>The key distinction: tactics can be trained to automatic recognition. Strategic understanding requires continuous conscious judgment. Both are necessary at the top level, but they develop on different timelines and deliver different returns at different rating levels.</p>

<h2>Why Tactics Win 80%+ of Games Below 1800</h2>
<p>Study any large database of games played below 1800 and you'll find the same pattern: the decisive factor is almost always tactical. One player hangs a piece, walks into a fork, misses a back-rank mate, or blunders into a pin. The strategic concepts both players were pursuing become irrelevant the moment the material balance shifts by two pawns or more.</p>
<p>This isn't because strategy doesn't matter — it's because tactical errors are so frequent at this level that most games never reach the strategic phase where long-term planning is decisive. A beautifully conceived queenside pawn advance means nothing if you hang your bishop on move 18.</p>
<p>The arithmetic is stark: if tactics decide 80% of your games, improving your tactical recognition by 20% has the same effect as improving your strategic understanding by 80%. Tactics deliver more rating points per hour of study, full stop.</p>

<h2>Why Studying Strategy First Is Backwards</h2>
<p>There's a seductive logic to studying strategy: it feels more sophisticated. Understanding Nimzo-Indian pawn structures or Rook endgame technique feels more like what real chess players do than grinding fork puzzles for the hundredth time.</p>
<p>But this is exactly backwards for most improving players. Strategy is the finishing layer — it determines who wins the games that don't end in a tactical blunder. If most of your games do end in a tactical blunder (which they do below 1800), you're studying the wrong layer.</p>
<p>Imagine trying to optimize the paint color of a car whose engine doesn't work. Strategic study before tactical mastery is similar: you're optimizing for a game state you rarely reach.</p>

<h2>The Research on Pattern Recognition vs. Calculation</h2>
<p>Cognitive science research on chess expertise consistently shows that grandmasters aren't calculating deeper than average players — they're recognizing patterns faster. In a classic study, Grandmasters and novices were shown chess positions for a few seconds. GMs could reconstruct game positions almost perfectly; novices couldn't. But when shown random piece placements (no tactical or strategic logic), GMs performed no better than novices.</p>
<p>The conclusion: expert chess players have an enormous library of stored patterns, not superhuman calculation ability. Their advantage is recognition, not raw computation. And pattern recognition — unlike strategic judgment, which requires broad positional understanding — can be directly trained through targeted repetition.</p>
<p>This is why tactical training with spaced repetition is so powerful: you're not just getting better at puzzles, you're building the same pattern library that makes grandmasters look like they're calculating effortlessly. They're not. They're recognizing.</p>

<h2>A Practical Framework</h2>
<p>This doesn't mean never study strategy. It means sequence your training correctly: build tactical mastery first, then layer in strategic concepts as you approach 1800 and above. At that level, games are decided less by tactical blunders and more by positional advantages that compound over time. Strategy starts to matter more because both players are handling tactics reliably.</p>
<p>Until then, every hour spent on spaced repetition tactics training is almost certainly more valuable than an hour on strategic concepts. Build the foundation first. The strategic layer has a solid base to rest on.</p>

<p>Read more: <a href="/blog/spaced-repetition-chess">How spaced repetition builds chess pattern recognition →</a> | <a href="/blog/how-many-chess-puzzles-per-day">How many puzzles you actually need per day →</a></p>
`,
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug);
}
