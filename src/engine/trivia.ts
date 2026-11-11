import type { Rng } from './util';

// Starter question bank. Each answer was picked to be uncontroversial and
// stable over time. `c` is the index of the correct answer.

export interface Question {
  q: string;
  a: [string, string, string, string];
  c: number;
}

export const QUESTIONS: Question[] = [
  { q: 'How many players does each team have on the field in soccer?', a: ['9', '10', '11', '12'], c: 2 },
  { q: 'How long is one quarter of an NBA game?', a: ['10 min', '12 min', '15 min', '20 min'], c: 1 },
  { q: 'What is a perfect score in ten-pin bowling?', a: ['250', '300', '350', '400'], c: 1 },
  { q: 'Which is the largest planet in our solar system?', a: ['Saturn', 'Neptune', 'Earth', 'Jupiter'], c: 3 },
  { q: 'How many bones are in the adult human body?', a: ['186', '206', '226', '306'], c: 1 },
  { q: 'How many points is a touchdown worth in American football, before the extra point?', a: ['3', '5', '6', '7'], c: 2 },
  { q: 'How many players are on the court for one basketball team?', a: ['4', '5', '6', '7'], c: 1 },
  { q: 'How long is a marathon?', a: ['24.2 mi', '26.2 mi', '28.2 mi', '30 mi'], c: 1 },
  { q: 'How many holes are played in a standard round of golf?', a: ['9', '12', '18', '24'], c: 2 },
  { q: 'What is the chemical symbol for gold?', a: ['Go', 'Gd', 'Au', 'Ag'], c: 2 },
  { q: 'Which planet is known as the Red Planet?', a: ['Venus', 'Mars', 'Mercury', 'Jupiter'], c: 1 },
  { q: 'How many minutes are in a full day?', a: ['1,140', '1,440', '1,680', '2,400'], c: 1 },
  { q: 'What is the boiling point of water at sea level in Fahrenheit?', a: ['180°F', '200°F', '212°F', '232°F'], c: 2 },
  { q: 'How many sides does a hexagon have?', a: ['5', '6', '7', '8'], c: 1 },
  { q: 'Which ocean is the largest?', a: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], c: 3 },
  { q: 'How many strings does a standard guitar have?', a: ['4', '5', '6', '7'], c: 2 },
  { q: 'What is the largest organ of the human body?', a: ['Liver', 'Skin', 'Lungs', 'Brain'], c: 1 },
  { q: 'How many innings are in a regulation MLB game?', a: ['7', '8', '9', '10'], c: 2 },
  { q: 'What is the hardest natural substance?', a: ['Quartz', 'Titanium', 'Diamond', 'Granite'], c: 2 },
  { q: 'How many continents are there?', a: ['5', '6', '7', '8'], c: 2 },
  { q: 'What is the square root of 144?', a: ['11', '12', '13', '14'], c: 1 },
  { q: 'Which gas do plants take in from the air to make food?', a: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Helium'], c: 2 },
  { q: 'How many ounces are in a pound?', a: ['12', '14', '16', '20'], c: 2 },
  { q: 'How many feet are in a mile?', a: ['3,280', '5,280', '6,080', '5,000'], c: 1 },
  { q: 'Which country hosted the 2016 Summer Olympics?', a: ['China', 'UK', 'Brazil', 'Japan'], c: 2 },
  { q: 'How many players are on the ice for one hockey team, including the goalie?', a: ['5', '6', '7', '11'], c: 1 },
  { q: 'What is the capital of Australia?', a: ['Sydney', 'Melbourne', 'Canberra', 'Perth'], c: 2 },
  { q: 'What is the capital of Canada?', a: ['Toronto', 'Ottawa', 'Vancouver', 'Montreal'], c: 1 },
  { q: 'How many weeks are in a year?', a: ['48', '50', '52', '54'], c: 2 },
  { q: 'How many teeth does a typical adult have, including wisdom teeth?', a: ['28', '30', '32', '36'], c: 2 },
  { q: 'What is the freezing point of water in Celsius?', a: ['-10°C', '0°C', '10°C', '32°C'], c: 1 },
  { q: 'How many chambers does the human heart have?', a: ['2', '3', '4', '5'], c: 2 },
  { q: 'Which planet is closest to the Sun?', a: ['Venus', 'Earth', 'Mars', 'Mercury'], c: 3 },
  { q: 'How many squares are on a chessboard?', a: ['36', '49', '64', '81'], c: 2 },
  { q: 'In tennis, what is a score of zero called?', a: ['Nil', 'Love', 'Zero', 'Duck'], c: 1 },
  { q: 'How many rings are on the Olympic flag?', a: ['4', '5', '6', '7'], c: 1 },
  { q: 'What is 15% of 200?', a: ['15', '20', '30', '35'], c: 2 },
  { q: 'How many seconds are in an hour?', a: ['360', '3,600', '6,000', '36,000'], c: 1 },
  { q: 'Which is the longest river in South America?', a: ['Orinoco', 'Paraná', 'Amazon', 'Magdalena'], c: 2 },
  { q: 'How many keys are on a standard piano?', a: ['76', '82', '88', '96'], c: 2 },
  { q: 'Which blood type is the universal red-cell donor?', a: ['A+', 'B-', 'AB+', 'O-'], c: 3 },
  { q: 'How many points is a free throw worth?', a: ['1', '2', '3', '4'], c: 0 },
  { q: 'What is the largest mammal on Earth?', a: ['Elephant', 'Blue whale', 'Giraffe', 'Orca'], c: 1 },
  { q: 'How many states are in the USA?', a: ['48', '50', '51', '52'], c: 1 },
  { q: 'What is 7 × 8?', a: ['54', '56', '58', '64'], c: 1 },
  { q: 'How many players are on a volleyball court for one team?', a: ['5', '6', '7', '8'], c: 1 },
  { q: 'Which element has the chemical symbol O?', a: ['Gold', 'Osmium', 'Oxygen', 'Oganesson'], c: 2 },
  { q: 'How many cards are in a standard deck, without jokers?', a: ['48', '50', '52', '54'], c: 2 },
  { q: 'What is the smallest prime number?', a: ['0', '1', '2', '3'], c: 2 },
  { q: 'How many degrees are in a right angle?', a: ['45', '90', '180', '360'], c: 1 },
  { q: 'How long is an Olympic swimming pool?', a: ['25 m', '50 m', '75 m', '100 m'], c: 1 },
  { q: 'How many laps of a standard outdoor track make one mile, roughly?', a: ['2', '4', '6', '8'], c: 1 },
  { q: 'Which vitamin does your skin make from sunlight?', a: ['Vitamin A', 'Vitamin B12', 'Vitamin C', 'Vitamin D'], c: 3 },
  { q: 'How many calories are in one gram of protein?', a: ['2', '4', '7', '9'], c: 1 },
  { q: 'How many calories are in one gram of fat?', a: ['4', '7', '9', '12'], c: 2 },
  { q: 'How much does a standard Olympic barbell weigh in pounds, roughly?', a: ['25 lb', '35 lb', '45 lb', '55 lb'], c: 2 },
  { q: 'Which country is home to the kangaroo?', a: ['New Zealand', 'South Africa', 'Australia', 'Argentina'], c: 2 },
];

export const TRIVIA_ROUND = 5;
export const TRIVIA_SECONDS = 10;

export function triviaScore(questionIds: number[], answers: number[]): number {
  let s = 0;
  questionIds.forEach((qid, i) => {
    if (answers[i] === QUESTIONS[qid]?.c) s++;
  });
  return s;
}

/** A bot gets each question right with probability `skill`, otherwise guesses. */
export function botAnswers(questionIds: number[], skill: number, rng: Rng): number[] {
  return questionIds.map((qid) => (rng() < skill ? QUESTIONS[qid].c : Math.floor(rng() * 4)));
}
