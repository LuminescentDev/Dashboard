const { MessageEmbed } = require("discord.js");

function sleep(ms) {
	return new Promise(res => setTimeout(res, ms));
}

module.exports = async (client, info) => {

	// initiate the embed
	const voteEmbed = new MessageEmbed()
    .setTitle("Vote Received")
    .setURL(`https://discordbotlist.com/bots/shoto/upvote`);
	try {
		// select the user from the database
		const user = await client.getUser(info.id);
			// if user does not exist add them
			if(!user) {
				require("./createUser")(client, info.id);
				sleep(100);
				client.con.query(`UPDATE Users Set voteTotal = 1, lastVote = ${Date.now()} where userID = "${info.id}"`);
				// set embed description and send it to the vote channel
				voteEmbed.setDescription(`Thank you for voting ${client.users.cache.get(info.id).username}\n You now have 1 Vote!\n You can vote again in <t:${Math.floor(Date.now() / 1000 + 43200)}:R>`);
				client.channels.cache.get(client.config.votechannel).send({ embeds: [voteEmbed] });
			}else{
				// get users vote total from the database and add 1 and update lastevote to current time
				client.con.query(`UPDATE Users Set voteTotal = ${user.voteTotal += 1}, lastVote = ${Date.now()} where userID = "${info.id}"`);

				// set embed description and send it to the vote channel
				voteEmbed.setDescription(`Thank you for voting ${client.users.cache.get(info.id).username}\n You now have ${user.voteTotal} Votes!\nYou can vote again in <t:${Math.floor(Date.now() / 1000 + 43200)}:R>`);
				client.channels.cache.get(client.config.votechannel).send({ embeds: [voteEmbed] });
			}
	} catch (error) {
		client.users.cache.get(client.config.ownerID).send(`${error}`);
		client.channels.cache.get(client.config.errorChannelID).send(`Error with receiving vote: ${error}`);
	}
};