import type * as discord from "discord.js";

export interface DiscordToken {
  token: string;
  serverId: string;
}

export interface DiscordBot {
  id: string;
  client: discord.Client;
  server: discord.Guild;
  serverId: string;
  token: string;
}

export type DiscordEmbed = discord.APIEmbed;
export type DiscordMessage = discord.MessageCreateOptions;
export type DiscordButton = discord.APIActionRowComponent<any>;
export type DiscordMember = discord.GuildMember;

export interface DiscordBotInfo {
  id: string;
  serverId: string;
  accessToken: string;
}
export interface DiscordReactEventInfo {
  id: string;
  messageId: string;
}

export interface SendMessageWithEmbedType {
  botId: string;
  channelId: string;
  message: string;
  embed: discord.APIEmbed;
  button?: DiscordButton[];
}

export interface SendWebhookMessageWithEmbedType {
  message: string;
  embed: discord.APIEmbed;
}
