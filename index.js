const express = require('express');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const mongoose = require('mongoose');
const handlebars = require('express-handlebars');
//const MongoStore = require('connect-mongo');
const cluster = require('cluster');
const compression = require('compression');
const log4js = require('log4js');

const app = express();
//app.use(compression());

const User = require('./db/model');

const numCPUs = require('os').cpus().length;

/* -------------- Datos por CL -------------- */

const portCL = process.argv[2] || 3040;
const FACEBOOK_APP_ID = process.argv[3] || '1088323731578912';
const FACEBOOK_APP_SECRET = process.argv[4] || '00000000000000000';
const modoCluster = process.argv[5] == 'CLUSTER';


/* -------------- PASSPORT w FACEBOOK -------------- */
const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;

//const bCrypt = require('bCrypt');
//const LocalStrategy = require('passport-local').Strategy;

/* -------------- LOGGERS -------------- */
log4js.configure({
    appenders: {
        miLoggerConsole: {type: "console"},
        miLoggerFileWarning: {type: 'file', filename: 'warn.log'},
        miLoggerFileError: {type: 'file', filename: 'error.log'}
    },
    categories: {
        default: {appenders: ["miLoggerConsole"], level:"trace"},
        info: {appenders: ["miLoggerConsole"], level: "info"},
        warn: {appenders:["miLoggerFileWarning"], level: "warn"},
        error: {appenders: ["miLoggerFileError"], level: "error"}
    }
});

const loggerInfo = log4js.getLogger('info');
const loggerWarn = log4js.getLogger('warn');
const loggerError = log4js.getLogger('error');

/* -------------------------------------------- */
/* MASTER */

if(modoCluster && cluster.isMaster) {
    // if Master, crea workers

    loggerInfo.info(`Master ${process.pid} is running`);

    // fork workers
    for (let i=0; i<numCPUs; i++){
        cluster.fork();
    };

    cluster.on('exit', (worker) => {
        loggerInfo.info(`Worker ${worker.process.pid} died`);
    });
} else {
    // if !Master, alta al servidor + resto funcionalidades

    passport.use(new FacebookStrategy({
        clientID: FACEBOOK_APP_ID, 
        clientSecret: FACEBOOK_APP_SECRET,
        callbackURL: '/auth/facebook/callback',
        profileFields: ['id', 'displayName', 'photos', 'emails'],
        scope: ['email']
    }, function(accessToken, refreshToken, profile, done) {
        let userProfile = profile;
    
        return done(null, userProfile);
    }));

    /* -------------- serialize + deserialize -------------- */
    passport.serializeUser(function(user, cb) {
        cb(null, user);
    });

    passport.deserializeUser(function(obj, cb) {
        cb(null, obj);
    });

    /* ------------------------------------ */
    /* CONFIG */
    app.use(express.json());
    app.use(express.urlencoded({extended:true}));

    app.use(cookieParser());
    app.use(session({
        /*
        store: MongoStore.create({
            mongoUrl: 'mongodb+srv://XiomaraS:UZosgIq3UUSc8add@coderhouse.j2t64.mongodb.net/myFirstDatabase?retryWrites=true&w=majority',
            ttl: 600
        }),*/
        secret: 'secret',
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: {
            maxAge: 60000
        }
    }));


    app.engine(
        "hbs", 
        handlebars({
            extname: ".hbs",
            defaultLayout: 'index.hbs',
        })
    );


    app.set("view engine", "hbs");
    app.set("views", "./views");

    app.use(express.static('public'));
    app.use(passport.initialize());
    app.use(passport.session());

    /* -------------- LOGIN -------------- */
    app.get('/login', (req, res)=>{
        if(req.isAuthenticated()){
            res.render("welcome", {
                nombre: req.user.displayName,
                foto: req.user.photos[0].value,
                email: req.user.emails[0].value,
                contador: req.user.contador
            })
        }
        else {
            res.sendFile(process.cwd() + '/public/login.html')
        }
    })

    app.get('/auth/facebook', passport.authenticate('facebook'));
    app.get('/auth/facebook/callback', passport.authenticate('facebook',
        {
            successRedirect: '/welcome',
            failureRedirect: '/faillogin'
        }
    ));

    app.get('/welcome', (req, res) => {
        //console.log(req.user);
        res.redirect('/');
    });

    app.get('/faillogin', (req, res) => {
        res.render('login-error', {});
    });

    app.get('/logout', (req, res)=>{
        let nombre = req.user.displayName;
        req.logout();
        res.render("logout", { nombre })
    });

    /* -------------- GLOBAL PROCESS & CHILD PROCESS -------------- */

    // PROCESS
    app.get('/info', (req, res) => {

        let info = {
            rgEntrada: JSON.stringify(process.argv, null, '\t'), 
            os: process.platform, 
            nodeVs: process.version, 
            memoryUsage: JSON.stringify(process.memoryUsage()), 
            excPath: process.execPath, 
            processID: process.pid, 
            folder: process.cwd(),
            numCPUs
        };

        // test
        // console.log(info);

        res.render("info", info);
    });

    // CHILD PROCESS
    /*
    const {fork} = require('child_process');

    // /randoms?cant=20000
    app.get('/randoms', (req, res) => {
        try{
            const randomNumber = fork('./child.js');
            randomNumber.send(req.query)
            randomNumber.on('message', numerosRandom => {
                res.end(`Numeros random ${JSON.stringify(numerosRandom)}`);
            });
        } catch (err) {
            loggerError.error(err);
        }  
    }); */

    /* -------------- DB CONNECTION -------------- */

    app.listen(portCL, ()=>{
        loggerInfo.info(`Running on PORT ${portCL} - PID WORKER ${process.pid}`);
        mongoose.connect('mongodb://localhost:27017/ecommerce', 
            {
                useNewUrlParser: true, 
                useUnifiedTopology: true
            }
        )
            .then( () => loggerInfo.info('Base de datos conectada') )
            .catch( (err) => loggerError.error(err) );
    })

    loggerInfo.info(`Worker ${process.pid} started`);
};


/*
passport.use('login', new LocalStrategy({
        passReqToCallback: true
    },
    function(req, username, password, done) {
        // ver en db si existe el username
        User.findOne({ 'username' : username },
            function(err, user) {
                // If there is an error
                if(err) {
                    return done(err);
                }
                // If username does not exist on db
                if(!user) {
                    console.log(`Usuario "${username}" no encontrado`);
                    console.log('message', 'Usuario no encontrado');
                    return done(null, false);
                }
                // User exists but wrong pwrd
                if(!isValidPassword(user, password)) {
                    console.log('Contrasena no valida');
                    console.log('message', 'Invalid Password');
                    return done(null, false);
                }
                // si alles is goed
                return done(null, user);
            }
        );
    })
);

const isValidPassword = function(user, password){
    return bCrypt.compareSync(password, user.password);
} */

/* -------------- registration check -------------- */
/*
passport.use('register', new LocalStrategy({
        passReqToCallback: true
    },
    function(req, username, password, done) {
        const findOrCreateUser = function(){
            User.findOne({'username':username}, function(err, user){
                if(err){
                    console.log(`Error en el registro: "${err}"`);
                    return done(err);
                }
                // si user ya existe
                if (user) {
                    console.log('Usuario ya existe');
                    console.log('message', 'Usuario ya existe en la base');
                    return done(null, false);
                } else {
                    // si no existe, crear el usuario
                    var newUser = new User();

                    newUser.username = username;
                    newUser.password = createHash(password);

                    newUser.save(function(err) {
                        if(err) {
                            console.log(`Error guardando el usuario: "${err}"`);
                            throw err;
                        }
                        console.log('Usuario registrado con exito');
                        return done(null, newUser);
                    });
                }
            });
        }
        process.nextTick(findOrCreateUser);
    })
)

*/

/* -------------- crear hash para pwrd -------------- */
/*/
const createHash = function(password) {
    return bCrypt.hashSync(password, bCrypt.genSaltSync(10), null);
}*/







/* -------------- LOGIN Y LOGOUT c/ FB-------------- */

//onst getSessionName = req => req.session.nombre? req.session.nombre: ''



/*
app.post('/login', passport.authenticate('login', { failureRedirect: '/faillogin'}), (req, res) => {
    res.redirect('/')
}) */



/*
app.post('/login', (req, res)=>{
    let { nombre } = req.body;
    req.session.nombre = nombre;
    res.redirect('/');
}) */





/* -------------- REGISTER -------------- */

/*
app.get('/register', (req, res) => {
    res.sendFile(process.cwd() + '/public/register.html');
})

app.post('/register', passport.authenticate('register', {failureRedirect: '/failregister'}), (req, res) => {
    res.redirect('/');
})

app.get('/failregister', (req, res) => {
    res.render('register-error', {});
})
*/

