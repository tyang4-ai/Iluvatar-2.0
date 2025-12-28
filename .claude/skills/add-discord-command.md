# Skill: Add a Discord Slash Command

This guide explains how to add new Discord slash commands to the ILUVATAR system.

## Overview

Discord slash commands are the primary user interface for ILUVATAR. Commands are defined in `/iluvatar-2.0/orchestrator/discord-bot.js`.

## Existing Commands

**Admin Commands** (owner-only, no SSH required):
- `/admin-set-env` - Set environment variable
- `/admin-get-env` - Get environment variable (masked)
- `/admin-list-hackathons` - List all hackathons
- `/admin-pause` - Pause a hackathon
- `/admin-resume` - Resume a hackathon

**User Commands**:
- `/start` - Start a new hackathon
- `/status` - Check hackathon status
- `/approve` - Approve a checkpoint
- `/reject` - Reject a checkpoint

## Step 1: Define the Command

Add the command definition in `discord-bot.js`:

```javascript
const { SlashCommandBuilder } = require('discord.js');

const commands = [
  // ... existing commands ...

  new SlashCommandBuilder()
    .setName('your-command')
    .setDescription('What this command does')
    .addStringOption(option =>
      option
        .setName('param1')
        .setDescription('Description of param1')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('param2')
        .setDescription('Description of param2')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option
        .setName('flag')
        .setDescription('Enable or disable something')
    )
];
```

## Step 2: Add the Handler

Add a handler in the `interactionCreate` event:

```javascript
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'your-command') {
    await handleYourCommand(interaction);
  }
});

async function handleYourCommand(interaction) {
  // Get options
  const param1 = interaction.options.getString('param1');
  const param2 = interaction.options.getInteger('param2') || 10; // default
  const flag = interaction.options.getBoolean('flag') ?? true; // default

  // Defer reply for long operations
  await interaction.deferReply({ ephemeral: true });

  try {
    // Do something
    const result = await doSomething(param1, param2, flag);

    // Send response
    await interaction.editReply({
      content: `Success! Result: ${result}`,
      ephemeral: true
    });
  } catch (error) {
    logger.error('Command failed', {
      command: 'your-command',
      error: error.message,
      user: interaction.user.id
    });

    await interaction.editReply({
      content: `Error: ${error.message}`,
      ephemeral: true
    });
  }
}
```

## Step 3: Add Permission Checks

For admin commands:

```javascript
async function handleAdminCommand(interaction) {
  // Check if user is bot owner
  const ownerId = process.env.DISCORD_OWNER_ID;
  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: 'This command is restricted to bot owners.',
      ephemeral: true
    });
    return;
  }

  // Continue with command...
}
```

For channel-specific commands:

```javascript
async function handleHackathonCommand(interaction) {
  // Check if in hackathon channel
  const hackathonId = await getHackathonForChannel(interaction.channelId);
  if (!hackathonId) {
    await interaction.reply({
      content: 'This command must be used in a hackathon channel.',
      ephemeral: true
    });
    return;
  }

  // Continue with command...
}
```

## Step 4: Register Commands

Commands are registered on bot startup. For development, you can force re-registration:

```javascript
// In discord-bot.js
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
    { body: commands.map(cmd => cmd.toJSON()) }
  );

  console.log('Slash commands registered');
}
```

## Option Types

```javascript
// String
.addStringOption(option =>
  option.setName('text').setDescription('Text input')
)

// Integer
.addIntegerOption(option =>
  option.setName('number').setDescription('Number input')
    .setMinValue(1).setMaxValue(100)
)

// Boolean
.addBooleanOption(option =>
  option.setName('enabled').setDescription('Enable feature')
)

// User mention
.addUserOption(option =>
  option.setName('user').setDescription('Select a user')
)

// Channel
.addChannelOption(option =>
  option.setName('channel').setDescription('Select a channel')
)

// Role
.addRoleOption(option =>
  option.setName('role').setDescription('Select a role')
)

// Choices (dropdown)
.addStringOption(option =>
  option.setName('platform')
    .setDescription('Deployment platform')
    .addChoices(
      { name: 'Vercel', value: 'vercel' },
      { name: 'Railway', value: 'railway' },
      { name: 'Render', value: 'render' }
    )
)
```

## Response Types

```javascript
// Simple text
await interaction.reply('Message');

// Ephemeral (only visible to user)
await interaction.reply({ content: 'Private message', ephemeral: true });

// Embed
const embed = new EmbedBuilder()
  .setTitle('Title')
  .setDescription('Description')
  .setColor(0x00ff00)
  .addFields(
    { name: 'Field 1', value: 'Value 1', inline: true },
    { name: 'Field 2', value: 'Value 2', inline: true }
  )
  .setTimestamp();

await interaction.reply({ embeds: [embed] });

// Deferred reply (for long operations)
await interaction.deferReply();
// ... do work ...
await interaction.editReply('Done!');

// Follow-up message
await interaction.reply('Starting...');
await interaction.followUp('Update 1');
await interaction.followUp('Update 2');
```

## Buttons and Select Menus

```javascript
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Create buttons
const row = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('approve')
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('reject')
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger)
  );

await interaction.reply({
  content: 'Please review:',
  components: [row]
});

// Handle button click
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'approve') {
    await handleApprove(interaction);
  } else if (interaction.customId === 'reject') {
    await handleReject(interaction);
  }
});
```

## Integration with Message Bus

Publish events when commands are executed:

```javascript
async function handleStartCommand(interaction) {
  await interaction.deferReply();

  // Publish to message bus
  await messageBus.publish('agent:Gandalf', {
    from: 'Discord',
    type: 'hackathon_start',
    payload: {
      hackathon_id: generateId(),
      user_id: interaction.user.id,
      channel_id: interaction.channelId
    }
  });

  await interaction.editReply('Hackathon started! Gandalf is generating ideas...');
}
```

## Checklist

- [ ] Command defined with SlashCommandBuilder
- [ ] Handler function created
- [ ] Permission checks added (if needed)
- [ ] Proper error handling with user feedback
- [ ] Logging for debugging
- [ ] Commands registered (restart bot)
- [ ] Tested in Discord
