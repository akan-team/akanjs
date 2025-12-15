import * as discord from "discord.js";

interface DiscordToken {
  token: string;
  serverId: string;
}

interface DiscordBot {
  id: string;
  client: discord.Client;
  server: discord.Guild;
  serverId: string;
  token: string;
}

type DiscordEmbed = discord.APIEmbed;
type DiscordMessage = discord.MessageCreateOptions;
type DiscordButton = discord.APIActionRowComponent<any>;
type DiscordMember = discord.GuildMember;

interface DiscordBotInfo {
  id: string;
  serverId: string;
  accessToken: string;
}
interface DiscordReactEventInfo {
  id: string;
  messageId: string;
}

interface SendMessageWithEmbedType {
  botId: string;
  channelId: string;
  message: string;
  embed: discord.APIEmbed;
  button?: DiscordButton[];
}

export interface DiscordOptions {
  tokens: DiscordToken[];
  webhook: string;
}

export class DiscordApi {
  readonly #options: DiscordOptions;
  readonly #webhook: discord.WebhookClient;
  #bots: Map<string, DiscordBot> = new Map<string, DiscordBot>();
  constructor(options: DiscordOptions) {
    this.#options = options;
    this.#webhook = new discord.WebhookClient({ url: options.webhook });
  }
  static async makeDiscordBot({ token, serverId }: DiscordToken): Promise<DiscordBot> {
    const client = new discord.Client({
      intents: [
        discord.IntentsBitField.Flags.Guilds,
        discord.IntentsBitField.Flags.GuildMessages,
        discord.IntentsBitField.Flags.GuildPresences,
        discord.IntentsBitField.Flags.GuildMembers,
        discord.IntentsBitField.Flags.GuildMessageReactions,
        discord.IntentsBitField.Flags.GuildIntegrations,
        discord.IntentsBitField.Flags.DirectMessages,
        discord.IntentsBitField.Flags.DirectMessageReactions,
        discord.IntentsBitField.Flags.DirectMessageTyping,
      ],
    });
    void client.login(token);
    const server = client.guilds.cache.get(serverId);
    if (!server) throw new Error(`No Guild of Server in ${serverId}`);
    return new Promise((resolve, reject) => {
      client.on("ready", (client) => {
        resolve({ client, token, id: client.user.id, server, serverId });
      });
      client.on("error", (error) => {
        reject(error);
      });
    });
  }
  static async makeDiscordBots(tokens: DiscordToken[]): Promise<Map<string, DiscordBot>> {
    const bots = new Map<string, DiscordBot>();
    await Promise.all(
      tokens.map(async (token) => {
        const bot = await this.makeDiscordBot(token);
        bots.set(bot.id, bot);
      })
    );
    return bots;
  }
  async initBots() {
    this.#bots = await DiscordApi.makeDiscordBots(this.#options.tokens);
    return this;
  }
  async log(message: string) {
    return await this.#webhook.send(message);
  }
  async login(token: DiscordToken): Promise<DiscordBot> {
    const bot = await DiscordApi.makeDiscordBot(token);
    this.#bots.set(bot.id, bot);
    return bot;
  }
  logout(botId: string) {
    this.#bots.delete(botId);
  }
  bot(botId: string) {
    const bot = this.#bots.get(botId);
    if (!bot) throw new Error(`No Bot Found for botId: ${botId}`);
    return bot;
  }
  clientEvent<K extends keyof discord.ClientEvents>(
    botId: string,
    event: K,
    listener: (...args: discord.ClientEvents[K]) => discord.Awaitable<void>
  ) {
    this.bot(botId).client.on(event, listener);
  }
  async fetchChannelMessage(botId: string, channelId: string) {
    const channel = this.bot(botId).client.channels.cache.get(channelId);
    return await (channel as discord.TextChannel).messages.fetch();
  }
  async onlineUsers(botId: string, filterBot = true) {
    await this.bot(botId).server.members.fetch();
    return this.bot(botId).server.members.cache.filter(
      (m) => !!(m.presence && (filterBot ? !m.user.bot : true) && m.presence.status === "online")
    );
  }
  async users(botId: string) {
    await this.bot(botId).server.members.fetch();
    return this.bot(botId).server.members.cache;
  }
  findUser(botId: string, id: string) {
    return this.bot(botId).server.members.cache.get(id);
  }
  async banUser(botId: string, userId: string) {
    return this.bot(botId).server.members.ban(userId);
  }
  async sendMessage(botId: string, channelId: string, message: string) {
    return await (this.bot(botId).server.channels.cache.get(channelId) as discord.TextChannel).send(message);
  }
  async addRole(botId: string, userId: string, roleName: string) {
    const role = this.bot(botId).server.roles.cache.find((r) => r.id === roleName);
    const user = this.bot(botId).server.members.cache.get(userId);
    if (!role || !user) throw new Error("No Role or User");
    return await user.roles.add(role);
  }
  async removeRole(botId: string, userId: string, roleName: string) {
    const role = this.bot(botId).server.roles.cache.find((r) => r.id === roleName);
    const user = this.bot(botId).server.members.cache.get(userId);
    if (!role || !user) throw new Error("No Role or User");
    return await user.roles.remove(role);
  }
  async sendEmbed(botId: string, channelId: string, embed: discord.APIEmbed, button?: any[]) {
    const channel = this.bot(botId).server.channels.cache.get(channelId);
    return await (channel as discord.TextChannel).send({
      embeds: [embed],
      components: button,
    });
  }
  async sendMessageWithEmbed({ botId, channelId, message, embed, button }: SendMessageWithEmbedType) {
    const channel = this.bot(botId).server.channels.cache.get(channelId);
    return await (channel as discord.TextChannel).send({
      content: message,
      embeds: [embed],
      components: button,
    });
  }
}
