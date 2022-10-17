/* eslint-disable no-self-assign */
/* eslint-disable no-inline-comments */

// We import modules.
const url = require("url");
const ejs = require("ejs");
const path = require("path");
const chalk = require("chalk");
const express = require("express");
const config = require("../config");
const passport = require("passport");
const bodyParser = require("body-parser");
const session = require("express-session");
const { Permissions, MessageActionRow, MessageButton, MessageEmbed } = require("discord.js");
const Strategy = require("passport-discord").Strategy;
const { boxConsole } = require("../functions/boxConsole");

// We instantiate express app and the session store.
const app = express();
const MemoryStore = require("memorystore")(session);

// We export the dashboard as a function which we call in ready event.
module.exports = async (client) => {

  // We declare absolute paths.
  const dataDir = path.resolve(`${process.cwd()}${path.sep}dashboard`); // The absolute path of current this directory.
  const templateDir = path.resolve(`${dataDir}${path.sep}templates`); // Absolute path of ./templates directory.

  // Deserializing and serializing users without any additional logic.
  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((obj, done) => done(null, obj));

  // Validating the url by creating a new instance of an Url then assign an object with the host and protocol properties.
  // If a custom domain is used, we take the protocol, then the hostname and then we add the callback route.
  // Ex: Config key: https://localhost/ will have - hostname: localhost, protocol: http

  let domain;
  let callbackUrl;

  try {
    const domainUrl = new URL(config.domain);
    domain = {
      host: domainUrl.hostname,
      protocol: domainUrl.protocol,
    };
  } catch (e) {
    console.log(e);
    throw new TypeError("Invalid domain specific in the config file.");
  }

  if (config.usingCustomDomain) {
    callbackUrl = `${domain.protocol}//${domain.host}/callback`;
  } else {
    callbackUrl = `${domain.protocol}//${domain.host}${
      config.port == 80 ? "" : `:${config.port}`
    }/callback`;
  }

  // This line is to inform users where the system will begin redirecting the users.
  // And can be removed.
  const msg = `${chalk.red.bold("Info:")} ${chalk.green.italic(
    "Make sure you have added the Callback URL to the Discord's OAuth Redirects section in the developer portal.",
  )}`;
  boxConsole([
    `${chalk.red.bold("Callback URL:")} ${chalk.white.bold.italic.underline(
      callbackUrl,
    )}`,
    `${chalk.red.bold(
      "Discord Developer Portal:",
    )} ${chalk.white.bold.italic.underline(
      `https://discord.com/developers/applications/${config.id}/oauth2`,
    )}`,
    msg,
  ]);

  // We set the passport to use a new discord strategy, we pass in client id, secret, callback url and the scopes.
  /** Scopes:
	 *  - Identify: Avatar's url, username and discriminator.
	 *  - Guilds: A list of partial guilds.
	 */
  passport.use(
    new Strategy(
      {
        clientID: config.id,
        clientSecret: config.clientSecret,
        callbackURL: callbackUrl,
        scope: ["identify", "guilds"],
      },
      (accessToken, refreshToken, profile, done) => {
        // On login we pass in profile with no logic.
        process.nextTick(() => done(null, profile));
      },
    ),
  );

  // We initialize the memorystore middleware with our express app.
  app.use(
    session({
      store: new MemoryStore({ checkPeriod: 86400000 }),
      secret:
				config.secret,
      resave: false,
      saveUninitialized: false,
    }),
  );

  // We initialize passport middleware.
  app.use(passport.initialize());
  app.use(passport.session());

  // We bind the domain.
  app.locals.domain = config.domain.split("//")[1];

  // We set out the template engine.
  app.engine("ejs", ejs.renderFile);
  app.set("view engine", "ejs");

  // We initialize body-parser middleware to be able to read forms.
  app.use(bodyParser.json());
  app.use(
    bodyParser.urlencoded({
      extended: true,
    }),
  );

  // We host all of the files in the assets using their name in the root address.
  // A style.css file will be located at http://<your url>/style.css
  // You can link it in any template using src="/assets/filename.extension"
  app.use("/", express.static(path.resolve(`${dataDir}${path.sep}assets`)));

  // We declare a renderTemplate function to make rendering of a template in a route as easy as possible.
  const renderTemplate = (res, req, template, data = {}) => {
    // Default base data which passed to the ejs template by default.
    const baseData = {
      bot: client,
      path: req.path,
      user: req.isAuthenticated() ? req.user : null,
    };
    // We render template using the absolute path of the template and the merged default data with the additional data provided.
    res.render(
      path.resolve(`${templateDir}${path.sep}${template}`),
      Object.assign(baseData, data),
    );
  };

  // We declare a checkAuth function middleware to check if an user is logged in or not, and if not redirect him.
  const checkAuth = (req, res, next) => {
    // If authenticated we forward the request further in the route.
    if (req.isAuthenticated()) return next();
    // If not authenticated, we set the url the user is redirected to into the memory.
    req.session.backURL = req.url;
    // We redirect user to login endpoint/route.
    res.redirect("/login");
  };

  // Login endpoint.
  app.get(
    "/login",
    (req, res, next) => {
      // We determine the returning url.
      if (req.session.backURL) {
        req.session.backURL = req.session.backURL;
      } else if (req.headers.referer) {
        const parsed = url.parse(req.headers.referer);
        if (parsed.hostname === app.locals.domain) {
          req.session.backURL = parsed.path;
        }
      } else {
        req.session.backURL = "/";
      }
      // Forward the request to the passport middleware.
      next();
    },
    passport.authenticate("discord"),
  );

  // Callback endpoint.
  app.get(
    "/callback",
    passport.authenticate("discord", { failureRedirect: "/" }),
    /* We authenticate the user, if user canceled we redirect him to index. */ (
      req,
      res,
    ) => {
      // log when a user logs in
      client.guilds.cache.get("740705740221841450").channels.cache.get("913959650989338664").send(`User logged in: ${req.user.username + "#" + req.user.discriminator}`);
      // If user had set a returning url, we redirect him there, otherwise we redirect him to index.
      if (req.session.backURL) {
        const backURL = req.session.backURL;
        req.session.backURL = null;
        res.redirect(backURL);
      } else {
        res.redirect("/");
      }
    },
  );

  // Logout endpoint.
  app.get("/logout", function(req, res) {
    // We destroy the session.
    req.session.destroy(() => {
      // We logout the user.
      req.logout();
      // We redirect user to index.
      res.redirect("/");
    });
  });

  // Index endpoint.
  app.get("/", (req, res) => {
    renderTemplate(res, req, "index.ejs", {
      discordInvite: config.discordInvite,
    });
  });

  app.get("/privacy", (req, res) => {
    renderTemplate(res, req, "privacy.ejs", {
      discordInvite: config.discordInvite,
    });
  });

  app.get("/tos", (req, res) => {
    renderTemplate(res, req, "terms.ejs", {
      discordInvite: config.discordInvite,
    });
  });

  app.get("/staff", (req, res) => {
    renderTemplate(res, req, "staff.ejs", {
      discordInvite: config.discordInvite,
    });
  });

		app.get('/music', checkAuth, (req, res) =>
    renderTemplate(res, req, 'music.ejs', {
      perms: Permissions
    }));

  app.get("/user", checkAuth, async (req, res) => {
    const results = await client.getUser(req.user.id);
    const blacklist = await client.query(`SELECT * FROM blacklist WHERE userID = '${req.user.id}'`);
    renderTemplate(res, req, "user.ejs", {
      discordInvite: config.discordInvite,
      results,
      blacklist,
      alert: null
    });
  });

  app.post("/user", checkAuth, async (req, res) => {
    client.query(`UPDATE Users SET
    profileColor = ${`"${req.body.profileColor}"` ? `"${req.body.profileColor}"` : `#1C1C1C`},
    textColor = ${`"${req.body.textColor}"` ? `"${req.body.textColor}"` : `"#FFFFFF"`},
    WHERE userID = "${req.user.id}"`);
    const results = await client.getUser(req.user.id);
    const blacklist = await client.query(`SELECT * FROM blacklist WHERE userID = '${req.user.id}'`);
    console.log(req);
    renderTemplate(res, req, "user.ejs", {
      discordInvite: config.discordInvite,
      results,
      blacklist,
      alert: "Profile Updated"
    });
  });

  app.get("/user/:userID", checkAuth, async (req, res) => {
    if (!req.params.userID) return res.redirect("/user");
    if (req.user.id !== config.ownerID) return res.redirect("/user");
    const results = await client.getUser(req.params.userID);
    const reqUser = client.users.cache.get(req.params.userID);
    if(!reqUser) client.users.fetch(req.params.userID);
    renderTemplate(res, req, "userOther.ejs", {
      discordInvite: config.discordInvite,
      results,
      reqUser
    });
  });

  app.get("/user/blacklist/appeal", checkAuth, async (req, res) => {
    const results = await client.getUser(req.user.id);
    const blacklist = await client.query(`SELECT * FROM blacklist WHERE userID = '${req.user.id}'`);
    if(!blacklist.length == 1 && blacklist.appealed !== 0) return res.redirect("/user");
    renderTemplate(res, req, "userAppeal.ejs", {
      discordInvite: config.discordInvite,
      results,
      blacklist,
      alert: null
    });
  });

  app.post("/user/blacklist/appeal", checkAuth, async (req, res) => {
    const results = await client.getUser(req.user.id);
    const blacklist = await client.query(`SELECT * FROM blacklist WHERE userID = '${req.user.id}'`);
    if(blacklist.length == 1 && blacklist.appealed !== 1) {
      const embed = new MessageEmbed()
      .setTitle("Blacklist Appeal")
      .addField("User", `${req.user.username}#${req.user.discriminator}`)
      .addField("Reason", req.body.blacklistReason)
      .addField("Appeal Message", req.body.appealMessage)
      .setColor("#ff0000");
      const row = new MessageActionRow()
      .addComponents(
        new MessageButton()
        .setCustomId("acceptAppeal")
        .setLabel("Accept")
        .setStyle("SUCCESS"))
      .addComponents(
        new MessageButton()
        .setCustomId("denyAppeal")
        .setLabel("Deny")
        .setStyle("DANGER"));
      client.guilds.cache.get("740705740221841450").channels.cache.get("916156561813016617").send({ embeds: [embed], components: [row] });
      await client.query(`UPDATE blacklist SET appealed = 1 WHERE userID = '${req.user.id}'`);
      res.redirect("/user");
    } else {
      res.redirect("/user");
    }
  });

  // Dashboard endpoint.
  app.get("/dashboard", checkAuth, (req, res) => {
    renderTemplate(res, req, "dashboard.ejs", { perms: Permissions });
  });

  // Settings endpoint.
  app.get("/dashboard/:guildID", checkAuth, async (req, res) => {
    // We validate the request, check if guild exists, member is in guild and if member has minimum permissions, if not, we redirect it back.
    const guild = client.guilds.cache.get(req.params.guildID);
    if (!guild) return res.redirect("/dashboard");
    let member = guild.members.cache.get(req.user.id);
    if (!member) {
      try {
        await guild.members.fetch();
        member = guild.members.cache.get(req.user.id);
      } catch (err) {
        console.error(`Couldn't fetch the members of ${guild.id}: ${err}`);
      }
    }
    if (!member) return res.redirect("/dashboard");
    if (!member.permissions.has(Permissions.FLAGS.MANAGE_GUILD)) {
      return res.redirect("/dashboard");
    }

    // We retrieve the settings stored for this guild.
    let storedSettings = await client.getSettings(req.params.guildID);
    if (!storedSettings) {
      // If there are no settings stored for this guild, we create them and try to retrieve them again.
      client.setSettings(req.params.guildID);
      storedSettings = await client.getSettings(req.params.guildID);
      storedSettings = storedSettings;
    }

    renderTemplate(res, req, "settings.ejs", {
      guild,
      settings: storedSettings,
      alert: null,
    });
  });

  // Settings endpoint.
  app.post("/dashboard/:guildID", checkAuth, async (req, res) => {
    // We validate the request, check if guild exists, member is in guild and if member has minimum permissions, if not, we redirect it back.
    const guild = client.guilds.cache.get(req.params.guildID);
    const setting = req.body;
    if (!guild) return res.redirect("/dashboard");
    const member = guild.members.cache.get(req.user.id);
    if (!member) return res.redirect("/dashboard");
    if (!member.permissions.has("MANAGE_GUILD")) {
      return res.redirect("/dashboard");
    }

    // We save the settings.
    await client.query(`UPDATE Settings SET 
    prefix="${setting.prefix ? setting.prefix : '^'}",
    joinMessage=${`"${setting.joinMessage}"` ? `"${setting.joinMessage}"` : null},
    leaveMessage=${`"${setting.leaveMessage}"` ? `"${setting.leaveMessage}"` : null},
    logChannelID=${`"${setting.logChannelID}"` ? `"${setting.logChannelID}"` : null},
    logTypes=${ setting.logTypes ? setting.logTypes : null},
    joinChannelID=${`"${setting.joinChannelID}"` ? `"${setting.joinChannelID}"` : null},
    ventChannelID=${`"${setting.ventChannelID}"` ? `"${setting.ventChannelID}"` : null},
    vLogChannelID=${`"${setting.vLogChannelID}"` ? `"${setting.vLogChannelID}"` : null},
    AchannelID=${`"${setting.AchannelID}"` ? `"${setting.AchannelID}"` : null},
    ReviveRoleID=${`"${setting.ReviveRoleID}"` ? `"${setting.ReviveRoleID}"` : null},
    reviveMessage=${`"${setting.reviveMessage}"` ? `"${setting.reviveMessage}"` : null},
    StaffRoleID=${`"${setting.StaffRoleID}"` ? `"${setting.StaffRoleID}"` : null},
    language=${`"${setting.language}"` ? `"${setting.language}"` : "en"}
    WHERE guildID = "${req.params.guildID}"`).catch((e) => {
      console.log(e);
    });

    // We retrieve the settings stored for this guild.
    let storedSettings = await client.getSettings(req.params.guildID);
    if (!storedSettings) {
      // If there are no settings stored for this guild, we create them and try to retrieve them again.
      client.setSettings(guild.id);
      storedSettings = await client.getSettings(req.params.guildID);
      storedSettings = storedSettings;
    }

    // We render the template with an alert text which confirms that settings have been saved.
    renderTemplate(res, req, "settings.ejs", {
      guild,
      settings: storedSettings,
      alert: "Your settings have been saved.",
    });
  });

	app.post("/webhook", async (req, res) => {
		const body = req.body;
		const headers = req.headers;
		if(headers.authorization === config.topgg_webhook_auth) {
			res.statusCode = 200;
			res.json({
				message: "ok got it!"
			});
			await require("../database/models/topggVoteGet")(client,body);
		}else if(headers.authorization === config.dbl_webhook_auth) {
			res.statusCode = 200;
			res.json({
				message: "ok got it!"
			});
      await	require("../database/models/dblVoteGet")(client,body);
		}else{
			res.statusCode = 401;
			res.json({
				message: "Error unauthorized!"
			});
		}


	});

  app.listen(config.port, null, null, () =>
    console.log(`Dashboard is up and running on port ${config.port}.`),
  );
};
