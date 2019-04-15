import {Request, Response, NextFunction, RequestHandler} from 'express'; //= require('express');
import {User} from '../models/user';
import check from 'express-validator';
import {HttpException} from '../classes/HttpException';
import bodyParser = require('body-parser');
import { checkServerIdentity } from 'tls';
import { body } from 'express-validator/check';
import { Middleware } from '../middleware/common';


import { IsNumber, IsEmail } from 'class-validator';
//DEFINE HERE ALL DTO CLASSES FOR PARAMETER VALIDATION
class GetUserByIdDTO {
    @IsNumber()
    public id!: number;
}




export class UserController {
    public addNewUser (req: Request, res: Response, next: NextFunction) {                
        //TODO switch to await/async
        let params = User.build({id:"test"});

        User.create({
            firstName: "sergi",
            email: "test@test.test",
            preferredName: 'WithAccounts',
        }).then((result)=> {
            res.json(result);
        }).catch( (error) => {
            console.log("We got error !!!");
            next(new HttpException(400, error.message, error.errors));
        });
    }
    //Get all users
    public getUsers(req: Request, res: Response, next: NextFunction) {
        console.log("Get all users");
        User.findAll().then((result)=> {
            res.json(result);
        }).catch( (error) => {
            console.log("We got error !!!");
            next(new HttpException(500, error.message, error.errors));
        });
    }

    //Get user by ID
    public getUserById(req: Request, res: Response, next: NextFunction) {
        const id = req.body.id;
        User.findByPk(id).then((result)=> {
            res.json(result);
        }).catch( (error) => {
            console.log("We got error !!!");
            console.log(error);
            next(new HttpException(500, error.message, error.errors));
        });
    }   
    //Get user by ID CHECKS
    public getUserByIdChecks() {
        return Middleware.validation(GetUserByIdDTO);
    }

}