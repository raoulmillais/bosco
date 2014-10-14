var url = require('url');
var _ = require('lodash');
var async = require('async');
var Docker = require('dockerode');
var DockerUtils = require('./DockerUtils');

function Runner() {
}

Runner.prototype.init = function(bosco, next) {
    this.bosco = bosco;
    if(process.env.DOCKER_HOST) {
        // We are likely on OSX and Boot2docker
        var dockerUrl = url.parse(process.env.DOCKER_HOST || 'tcp://127.0.0.1:3000');
        this.docker = new Docker({
            host: dockerUrl.hostname,
            port: dockerUrl.port
        });
    } else {
        // Assume we are on linux and so connect on a socket
        this.docker = new Docker({socketPath: '/var/run/docker.sock'});
    }
    next();
}

Runner.prototype.list = function(detailed, next) {
    var self = this, docker = self.docker;
    docker.listContainers({
        all: false
    }, function(err, containers) {
        if(!detailed) return next(err, _.pluck(containers, 'Image'));
        next(err, containers);
    });
}

Runner.prototype.stop = function(options, next) {
    var self = this, docker = self.docker;
    var dockerFqn = self.getFqn(options);
    docker.listContainers({
        all: false
    }, function(err, containers) {
        var toStop = [];
        containers.forEach(function(container) {
            if(container.Image == dockerFqn) {
                var cnt = docker.getContainer(container.Id);
                toStop.push(cnt);
            }
        });
        async.map(toStop, function(container, cb) {
            container.stop(cb);
        }, next);
    });
}

Runner.prototype.start = function(options, next) {

    var self = this, docker = self.docker;
    var dockerFqn = self.getFqn(options);
    var createAndRun = function(err) {
        if (err) return next(err);
        DockerUtils.createContainer(docker, dockerFqn, options, function(err, container) {
            if (err) return next(err);
            DockerUtils.startContainer(docker, dockerFqn, options, container, next);
        });
    };

    if (options.service.alwaysPull) {
        DockerUtils.pullImage(self.bosco, docker, dockerFqn, createAndRun);
    } else {
        DockerUtils.locateImage(docker, dockerFqn, function(err, image) {
            if (err || image) return createAndRun(err);

            // Image not available
            DockerUtils.pullImage(self.bosco, docker, dockerFqn, createAndRun);
        })
    }
}

Runner.prototype.getFqn = function(options) {
    var dockerFqn = '', service = options.service;
    if (service.docker && service.docker.image) {
        dockerFqn = service.docker.image;
        if (dockerFqn.indexOf(':') === -1) {
            dockerFqn += ':latest';
        }
        return dockerFqn;
    }

    if (service.registry) dockerFqn += service.registry + '/';
    if (service.username) dockerFqn += service.username + '/';
    return dockerFqn + service.name + ':' + (service.version || 'latest');
}

module.exports = new Runner();
