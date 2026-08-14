import { Bot } from 'grammy';

export interface BotEventHandler {
  register(bot: Bot): void;
}
