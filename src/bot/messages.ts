import { escapeHtml } from '../escapeHtml.js';
import { formatReleaseDate } from '../formatDate.js';

export const messages = {
  welcome: `Привіт! Раз на два тижні надсилатиму афішу нових релізів у кіно.

Натисніть кнопку під фільмом, щоб отримати нагадування в день прем'єри.

/unsubscribe — відписатися від афіші
/mymovies — переглянути заплановані нагадування`,

  unsubscribed: 'Відписано від афіші. Повернутися можна командою /subscribe.',

  noPicks: 'Немає запланованих нагадувань. Обирайте фільми з афіші кнопкою «🎬 Хочу подивитись».',

  myMoviesEntry: (uaTitle: string, releaseDate: string) =>
    `🎬 ${uaTitle}\n📅 ${formatReleaseDate(releaseDate)}`,

  pickReminder: (uaTitle: string) => `🎉 Сьогодні прем'єра: <b>${escapeHtml(uaTitle)}</b>!`,
};
