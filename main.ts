import 'dotenv/config';
import telegraf from 'telegraf';
import * as _ from 'lodash';
import { foodTypes, areas } from './data';
import { Message } from 'telegram-typings';
import { promisify } from 'util';

const POLLS_PER_ROUND = 2;
const MAX_OPTIONS_PER_POLL = 4;
const MAX_ROUNDS = 3;
const WAIT_INTERVAL_SECONDS = 5;

const sleep = promisify(setTimeout);

// chatID -> roundNo
const CONVO_MAP: Map<number, number> = new Map();

const bot = new telegraf(process.env.TELEGRAM_BOT_TOKEN);
bot.command('start', (ctx) => {
  ctx.reply('Hi!');
});

bot.command('food', async (ctx) => {
  setTimeout(async () => {
    await ctx.reply('Starting food...');
    const messagesToRemove: Message[] = [];
    // @ts-ignore
    const chosenOptions: Poll[] = [];

    const foodTypesSample = _.sampleSize(
      foodTypes,
      MAX_OPTIONS_PER_POLL * POLLS_PER_ROUND * (MAX_ROUNDS - 1),
    );

    for (let roundIndex = 0; roundIndex < MAX_ROUNDS - 1; roundIndex += 1) {
      // Round announcement
      await ctx.replyWithMarkdown(
        `**Round ${roundIndex + 1}:**
Pick the food that you'd rather not have. (${WAIT_INTERVAL_SECONDS}sec)`,
      );

      for (let pollIndex = 0; pollIndex < POLLS_PER_ROUND; pollIndex += 1) {
        const chunkStartIndex = (roundIndex * POLLS_PER_ROUND + pollIndex) * MAX_OPTIONS_PER_POLL;
        const foodTypesChunk = _.slice(
          foodTypesSample,
          chunkStartIndex,
          chunkStartIndex + MAX_OPTIONS_PER_POLL,
        );
        console.log(foodTypesChunk)
        // @ts-ignore
        const pollMsg: Message = await ctx.telegram.sendPoll(
          ctx.chat.id,
          'I do not want:',
          [...foodTypesChunk, 'N/A'],
        );
        messagesToRemove.push(pollMsg);
      }
      await sleep(WAIT_INTERVAL_SECONDS * 1000);
      await Promise.all(messagesToRemove.map(async (msg) => {
        // @ts-ignore
        const poll = await ctx.telegram.stopPoll(msg.chat.id, msg.message_id);
        const leastVoterCount = _.min(_.flatMap(poll.options, opt => opt.voter_count));
        chosenOptions.push(..._.filter(poll.options, opt => opt.voter_count === leastVoterCount));
        ctx.telegram.deleteMessage(msg.chat.id, msg.message_id);
      }));
      messagesToRemove.length = 0;
    }

    await ctx.replyWithMarkdown(
      `Final Round: What sounds best to you? (${WAIT_INTERVAL_SECONDS}sec)`,
    );
    const randomChosenOpts = _.sampleSize(_.filter(chosenOptions, opt => opt.text !== 'N/A'), 3);
    // @ts-ignore
    const pollMsg: Message = await ctx.telegram.sendPoll(
      ctx.chat.id,
      'I would like:',
      randomChosenOpts.map(opt => opt.text),
    );
    await sleep(WAIT_INTERVAL_SECONDS * 1000);
    // @ts-ignore
    const poll = await ctx.telegram.stopPoll(pollMsg.chat.id, pollMsg.message_id);
    const mostVoterCount = _.max(_.flatMap(poll.options, opt => opt.voter_count));
    const results = _.filter(poll.options, opt => opt.voter_count === mostVoterCount);
    const result = _.sample(results);

    ctx.reply(`Chose: ${result.text}`);
  }, 0);
});
console.log('Running');
bot.startPolling();
