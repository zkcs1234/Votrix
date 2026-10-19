import multer from 'multer'
import { ApiError } from '../utils/ApiError.js'

export const competitionWorkbookUpload = multer({
  storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1},
  fileFilter(_req,file,callback){
    callback(file.originalname.toLowerCase().endsWith('.xlsx') ? null : new ApiError(400,'Upload a VOTRIX .xlsx workbook'),file.originalname.toLowerCase().endsWith('.xlsx'))
  },
}).single('file')
