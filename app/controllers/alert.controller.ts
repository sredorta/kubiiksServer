import {Request, Response, NextFunction, RequestHandler} from 'express'; 
import sequelize from 'sequelize';

import {HttpException} from '../classes/HttpException';
import { Middleware } from '../middleware/common';
import nodemailer from 'nodemailer';
import {body} from 'express-validator/check';

import {AppConfig} from '../utils/config';
import {messages} from '../middleware/common';
import { Email } from '../models/email';
import { Alert } from '../models/alert';
import { User } from '../models/user';
import { CustomValidators } from '../classes/CustomValidators';



export class AlertController {

    constructor() {}



    /**Gets all alerts of the user */
    static getAll = async (req: Request, res: Response, next:NextFunction) => {
        try {
            if(!req.user) throw new Error("User not found !");
            let result = [];
            let myAlerts = await Alert.findAll({order: [sequelize.literal('id DESC')],where:{userId:req.user.id}});
            res.json(myAlerts);
            //let alerts = await Alert.findAll({order: [sequelize.literal('id DESC')]});
            //for (let alert of alerts) result.push(alert.sanitize(res.locals.language));
            //res.json(alerts);
        } catch(error) {
            next(error);
        }
    }


    /**Gets article by id with all translations. Admin or content required (if cathegory not blog) or admin or blog required (if cathegory blog) */
    static update = async (req: Request, res: Response, next:NextFunction) => {
        try {
            if(!req.user) throw new Error("User not found !");
            let alert = await Alert.findByPk(req.body.alert.id);
            if (!alert) throw new Error("Could not find alert with id : " + req.body.article.id);
            //Check that alert is owned by current user
            if (alert.userId != req.user.id) 
                throw new Error("Cannot modify alert that you don't own !");
            //Do the update
            alert.isRead = req.body.alert.isRead;
            let myAlert = await alert.save();
            //let myAlert = await Alert.findByPk(req.body.alert.id);
            if (!myAlert) {
                throw new Error("Cannot modify alert that you don't own !");
            }
            res.json(myAlert);
        } catch(error) {
            next(error);
        }
    }
    /**Parameter validation */
    static updateChecks() {
        return [
            body('alert').exists().withMessage('exists'),
            body('alert.id').exists().withMessage('exists').custom(CustomValidators.dBExists(Alert,'id')),
            body('alert.isRead').exists().withMessage('exists').isBoolean(),
            Middleware.validate()
        ]
    }

    /**Deletes notification */
    static delete = async (req: Request, res: Response, next:NextFunction) => {
        try {
            if(!req.user) throw new Error("User not found !");
            let alert = await Alert.findByPk(req.body.id);
            if (!alert) throw new Error("Could not find alert with id : " + req.body.article.id);
            //Check that alert is owned by current user
            if (alert.userId != req.user.id) 
                throw new Error("Cannot modify alert that you don't own !");
            await alert.destroy();
            res.json("done"); 
        } catch(error) {
            next(error);
        }
    }
    /**Parameter validation */
    static deleteChecks() {
        return [
            body('id').exists().withMessage('exists').custom(CustomValidators.dBExists(Alert,'id')),
            Middleware.validate()
        ]
    }    

}        


